import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { DeviceToken } from '../entities/device-token.entity';
import { NotificationHistoryService } from './notification-history.service';
import { NotificationType, NotificationStatus } from '../entities/notification.entity';
import { TenantRepositoryFactory } from 'src/core/database/tenant-repository.factory';
import { TenantContextService } from 'src/core/tenant/tenant.context';

export interface FCMNotificationPayload {
  title: string;
  body: string;
  imageUrl?: string;
}

export interface FCMDataPayload {
  [key: string]: string; // All values must be strings
}

export interface NotificationOptions {
  priority?: 'high' | 'normal';
  type?: NotificationType;
  referenceId?: string;
  referenceType?: string;
  saveToHistory?: boolean; // Default: true
}

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private firebaseApp: admin.app.App;

  constructor(
    private readonly configService: ConfigService,
    private readonly tenantRepositoryFactory: TenantRepositoryFactory,
    private readonly tenantContext: TenantContextService,
    @Inject(forwardRef(() => NotificationHistoryService))
    private readonly notificationHistoryService: NotificationHistoryService,
  ) {}

  private get deviceTokenRepo() {
    return this.tenantRepositoryFactory.getRepository(DeviceToken);
  }

  private withTenantTopic(topic: string): string {
    const tenantSlug = this.tenantContext.getTenant()?.slug;
    return tenantSlug ? `${tenantSlug}.${topic}` : topic;
  }

  async onModuleInit() {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    try {
      // Try to get service account from path first
      const serviceAccountPath = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');

      if (serviceAccountPath) {
        // Initialize with file path
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccountPath),
        });
        this.logger.log('Firebase Admin initialized from file path');
        return;
      }

      // Fallback: try JSON string
      const serviceAccountJson = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT');

      if (serviceAccountJson) {
        const serviceAccountKey = JSON.parse(serviceAccountJson);
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccountKey),
        });
        this.logger.log('Firebase Admin initialized from JSON string');
        return;
      }

      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT not configured, FCM disabled',
      );
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin', error);
    }
  }

  /**
   * Check if Firebase is initialized
   */
  isInitialized(): boolean {
    return !!this.firebaseApp;
  }

  /**
   * Send notification to a single user (all their devices)
   */
  async sendToUser(
    userId: string,
    notification: FCMNotificationPayload,
    data?: FCMDataPayload,
    options?: NotificationOptions,
  ): Promise<{ success: number; failed: number; notificationId?: string }> {
    const saveToHistory = options?.saveToHistory !== false;

    // Save to history first
    let notificationId: string | undefined;
    if (saveToHistory) {
      try {
        const savedNotification = await this.notificationHistoryService.createNotification({
          userId,
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl,
          type: options?.type || NotificationType.GENERAL,
          data,
          referenceId: options?.referenceId,
          referenceType: options?.referenceType,
          status: NotificationStatus.SENT,
        });
        notificationId = savedNotification.id;
      } catch (error) {
        this.logger.error('Failed to save notification to history', error);
      }
    }

    if (!this.isInitialized()) {
      this.logger.warn('Firebase not initialized, skipping FCM send');
      return { success: 0, failed: 0, notificationId };
    }

    // Get all active device tokens for user
    const deviceTokens = await this.deviceTokenRepo.find({
      where: { user: { id: userId }, isActive: true },
    });

    if (deviceTokens.length === 0) {
      this.logger.debug(`No device tokens found for user ${userId}`);
      return { success: 0, failed: 0, notificationId };
    }

    const result = await this.sendToMultipleDevices(deviceTokens, notification, data, options);

    // Update notification status based on send result
    if (notificationId && result.success > 0) {
      await this.notificationHistoryService.updateStatus(notificationId, NotificationStatus.DELIVERED);
    } else if (notificationId && result.failed > 0 && result.success === 0) {
      await this.notificationHistoryService.updateStatus(notificationId, NotificationStatus.FAILED);
    }

    return { ...result, notificationId };
  }

  /**
   * Send notification to multiple device tokens
   * Uses sendEachForMulticast (Firebase Admin SDK v12+) or falls back to sendEach
   */
  async sendToMultipleDevices(
    deviceTokens: DeviceToken[],
    notification: FCMNotificationPayload,
    data?: FCMDataPayload,
    options?: NotificationOptions,
  ): Promise<{ success: number; failed: number }> {
    if (!this.isInitialized() || deviceTokens.length === 0) {
      return { success: 0, failed: deviceTokens.length };
    }

    const tokens = deviceTokens.map((dt) => dt.token);
    const messaging = admin.messaging();

    // Build individual messages for each token (Firebase Admin SDK v12+ approach)
    const messages: admin.messaging.Message[] = tokens.map((token) => ({
      token,
      notification: {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl,
      },
      data: this.serializeDataPayload(data),
      android: {
        priority: options?.priority || 'high',
        notification: {
          channelId: 'insurance_notifications',
          sound: 'default',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: notification.title,
              body: notification.body,
            },
            sound: 'default',
            badge: 1,
          },
        },
      },
      webpush: {
        notification: {
          title: notification.title,
          body: notification.body,
          icon: '/icon-192x192.png',
        },
      },
    }));

    try {
      // Use sendEach (the new API in Firebase Admin SDK v12+)
      const response = await messaging.sendEach(messages);

      let successCount = 0;
      let failedCount = 0;

      // Handle individual token responses
      for (let idx = 0; idx < response.responses.length; idx++) {
        const resp = response.responses[idx];
        const deviceToken = deviceTokens[idx];

        if (resp.success) {
          successCount++;
          // Update last used timestamp
          deviceToken.lastUsedAt = new Date();
          await this.deviceTokenRepo.save(deviceToken);
        } else {
          failedCount++;
          this.logger.warn(`Failed to send to token ${deviceToken.id}: ${resp.error?.message}`);

          // Handle invalid tokens
          if (
            resp.error?.code === 'messaging/invalid-registration-token' ||
            resp.error?.code === 'messaging/registration-token-not-registered'
          ) {
            // Mark token as inactive
            deviceToken.isActive = false;
            await this.deviceTokenRepo.save(deviceToken);
          }
        }
      }

      this.logger.log(`FCM send result: ${successCount} success, ${failedCount} failed`);

      return { success: successCount, failed: failedCount };
    } catch (error) {
      this.logger.error('Error sending FCM notifications', error);
      return { success: 0, failed: deviceTokens.length };
    }
  }

  /**
   * Send to a topic (for broadcasts, promos)
   */
  async sendToTopic(
    topic: string,
    notification: FCMNotificationPayload,
    data?: FCMDataPayload,
  ): Promise<boolean> {
    if (!this.isInitialized()) {
      return false;
    }

    const tenantTopic = this.withTenantTopic(topic);
    try {
      const message: admin.messaging.Message = {
        topic: tenantTopic,
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl,
        },
        data: this.serializeDataPayload(data),
        android: {
          priority: 'high',
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: notification.title,
                body: notification.body,
              },
              sound: 'default',
            },
          },
        },
      };

      await admin.messaging().send(message);
      this.logger.log(`Sent notification to topic: ${tenantTopic}`);
      return true;
    } catch (error) {
      this.logger.error(`Error sending to topic ${tenantTopic}`, error);
      return false;
    }
  }

  /**
   * Subscribe user's devices to a topic
   */
  async subscribeToTopic(
    userId: string,
    topic: string,
  ): Promise<{ success: number; failed: number }> {
    if (!this.isInitialized()) {
      return { success: 0, failed: 0 };
    }

    const deviceTokens = await this.deviceTokenRepo.find({
      where: { user: { id: userId }, isActive: true },
    });

    if (deviceTokens.length === 0) {
      return { success: 0, failed: 0 };
    }

    const tokens = deviceTokens.map((dt) => dt.token);

    const tenantTopic = this.withTenantTopic(topic);
    try {
      const response = await admin.messaging().subscribeToTopic(tokens, tenantTopic);
      this.logger.log(`Subscribed ${response.successCount} devices to topic ${tenantTopic}`);
      return {
        success: response.successCount,
        failed: response.failureCount,
      };
    } catch (error) {
      this.logger.error(`Error subscribing to topic ${tenantTopic}`, error);
      return { success: 0, failed: tokens.length };
    }
  }

  /**
   * Unsubscribe user's devices from a topic
   */
  async unsubscribeFromTopic(
    userId: string,
    topic: string,
  ): Promise<{ success: number; failed: number }> {
    if (!this.isInitialized()) {
      return { success: 0, failed: 0 };
    }

    const deviceTokens = await this.deviceTokenRepo.find({
      where: { user: { id: userId }, isActive: true },
    });

    if (deviceTokens.length === 0) {
      return { success: 0, failed: 0 };
    }

    const tokens = deviceTokens.map((dt) => dt.token);

    const tenantTopic = this.withTenantTopic(topic);
    try {
      const response = await admin.messaging().unsubscribeFromTopic(tokens, tenantTopic);
      this.logger.log(`Unsubscribed ${response.successCount} devices from topic ${tenantTopic}`);
      return {
        success: response.successCount,
        failed: response.failureCount,
      };
    } catch (error) {
      this.logger.error(`Error unsubscribing from topic ${tenantTopic}`, error);
      return { success: 0, failed: tokens.length };
    }
  }

  /**
   * Validate FCM token
   */
  async validateToken(token: string): Promise<boolean> {
    if (!this.isInitialized()) {
      return false;
    }

    try {
      // Try to send a test message (dry run)
      await admin.messaging().send(
        {
          token,
          notification: { title: 'test', body: 'test' },
        },
        true, // dryRun = true
      );
      return true;
    } catch (error) {
      this.logger.debug(`Token validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Serialize data payload (FCM requires string values)
   */
  private serializeDataPayload(data?: FCMDataPayload): Record<string, string> {
    if (!data) return {};

    const serialized: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      serialized[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    return serialized;
  }
}
