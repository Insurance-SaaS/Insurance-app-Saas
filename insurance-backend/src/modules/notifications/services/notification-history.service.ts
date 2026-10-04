import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import {
  Notification,
  NotificationType,
  NotificationStatus,
} from '../entities/notification.entity';
import {
  GetNotificationsQueryDto,
  PaginatedNotificationsResponseDto,
  NotificationResponseDto,
} from '../dtos/notification-history.dto';
import { FCMDataPayload } from './fcm.service';
import { TenantRepositoryFactory } from 'src/core/database/tenant-repository.factory';

export interface CreateNotificationParams {
  userId: string;
  title: string;
  body: string;
  imageUrl?: string;
  type?: NotificationType;
  data?: FCMDataPayload;
  referenceId?: string;
  referenceType?: string;
  status?: NotificationStatus;
}

@Injectable()
export class NotificationHistoryService {
  private readonly logger = new Logger(NotificationHistoryService.name);

  constructor(
    private readonly tenantRepositoryFactory: TenantRepositoryFactory,
  ) {}

  private get notificationRepo() {
    return this.tenantRepositoryFactory.getRepository(Notification);
  }

  /**
   * Create a notification record
   */
  async createNotification(params: CreateNotificationParams): Promise<Notification> {
    const notification = this.notificationRepo.create({
      user: { id: params.userId } as any,
      title: params.title,
      body: params.body,
      imageUrl: params.imageUrl || null,
      type: params.type || NotificationType.GENERAL,
      status: params.status || NotificationStatus.SENT,
      data: params.data ?? null,
      referenceId: params.referenceId || null,
      referenceType: params.referenceType || null,
      isRead: false,
    });

    const saved = await this.notificationRepo.save(notification);
    this.logger.debug(`Created notification ${saved.id} for user ${params.userId}`);
    return saved;
  }

  /**
   * Get paginated notifications for a user
   */
  async getUserNotifications(
    userId: string,
    query: GetNotificationsQueryDto,
  ): Promise<PaginatedNotificationsResponseDto> {
    const { page = 1, limit = 20, isRead, type } = query;
    const skip = (page - 1) * limit;

    // Build where conditions
    const whereConditions: any = { user: { id: userId } };

    if (isRead !== undefined) {
      whereConditions.isRead = isRead;
    }

    if (type) {
      whereConditions.type = type;
    }

    // Get total count and notifications
    const [notifications, total] = await this.notificationRepo.findAndCount({
      where: whereConditions,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    // Get unread count
    const unreadCount = await this.notificationRepo.count({
      where: { user: { id: userId }, isRead: false },
    });

    const items: NotificationResponseDto[] = notifications.map((n) =>
      this.mapToResponse(n),
    );

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      unreadCount,
    };
  }

  /**
   * Get a single notification by ID
   */
  async getNotificationById(
    userId: string,
    notificationId: string,
  ): Promise<NotificationResponseDto> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, user: { id: userId } },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.mapToResponse(notification);
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(userId: string, notificationId: string): Promise<NotificationResponseDto> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, user: { id: userId } },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      notification.status = NotificationStatus.READ;
      await this.notificationRepo.save(notification);
      this.logger.debug(`Marked notification ${notificationId} as read`);
    }

    return this.mapToResponse(notification);
  }

  /**
   * Mark multiple notifications as read
   */
  async markMultipleAsRead(
    userId: string,
    notificationIds: string[],
  ): Promise<{ updated: number }> {
    const result = await this.notificationRepo.update(
      {
        id: In(notificationIds),
        user: { id: userId },
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
        status: NotificationStatus.READ,
      },
    );

    this.logger.debug(`Marked ${result.affected} notifications as read for user ${userId}`);
    return { updated: result.affected || 0 };
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationRepo.update(
      {
        user: { id: userId },
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
        status: NotificationStatus.READ,
      },
    );

    this.logger.debug(`Marked all (${result.affected}) notifications as read for user ${userId}`);
    return { updated: result.affected || 0 };
  }

  /**
   * Get unread notifications count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepo.count({
      where: { user: { id: userId }, isRead: false },
    });
  }

  /**
   * Delete a notification
   */
  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, user: { id: userId } },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    await this.notificationRepo.remove(notification);
    this.logger.debug(`Deleted notification ${notificationId} for user ${userId}`);
  }

  /**
   * Delete all notifications for a user
   */
  async deleteAllNotifications(userId: string): Promise<{ deleted: number }> {
    const result = await this.notificationRepo.delete({
      user: { id: userId },
    });

    this.logger.debug(`Deleted ${result.affected} notifications for user ${userId}`);
    return { deleted: result.affected || 0 };
  }

  /**
   * Update notification status (for delivery tracking)
   */
  async updateStatus(notificationId: string, status: NotificationStatus): Promise<void> {
    await this.notificationRepo.update(notificationId, { status });
  }

  /**
   * Map entity to response DTO
   */
  private mapToResponse(notification: Notification): NotificationResponseDto {
    return {
      id: notification.id,
      title: notification.title,
      body: notification.body,
      imageUrl: notification.imageUrl || undefined,
      type: notification.type,
      isRead: notification.isRead,
      readAt: notification.readAt || undefined,
      data: notification.getDataPayload() || undefined,
      referenceId: notification.referenceId || undefined,
      referenceType: notification.referenceType || undefined,
      createdAt: notification.createdAt,
    };
  }
}

