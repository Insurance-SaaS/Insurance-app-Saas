import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { DeviceToken } from '../entities/device-token.entity';
import { RegisterDeviceTokenDto } from '../dtos/register-device-token.dto';
import { FcmService } from './fcm.service';
import { TenantRepositoryFactory } from 'src/core/database/tenant-repository.factory';

@Injectable()
export class DeviceTokenService {
  private readonly logger = new Logger(DeviceTokenService.name);

  constructor(
    private readonly tenantRepositoryFactory: TenantRepositoryFactory,
    private readonly fcmService: FcmService,
  ) {}

  private get deviceTokenRepo() {
    return this.tenantRepositoryFactory.getRepository(DeviceToken);
  }

  /**
   * Register or update a device token
   */
  async registerToken(
    userId: string,
    dto: RegisterDeviceTokenDto,
  ): Promise<DeviceToken> {
    // Check if token already exists for this user
    let deviceToken = await this.deviceTokenRepo.findOne({
      where: {
        user: { id: userId },
        token: dto.token,
      },
    });

    if (deviceToken) {
      // Update existing token
      deviceToken.platform = dto.platform;
      if (dto.deviceId !== undefined) {
        deviceToken.deviceId = dto.deviceId;
      }
      if (dto.appVersion !== undefined) {
        deviceToken.appVersion = dto.appVersion;
      }
      deviceToken.isActive = true;
      deviceToken = await this.deviceTokenRepo.save(deviceToken);
      this.logger.log(`Updated device token for user ${userId}`);
    } else {
      // Validate token with FCM before saving
      const isValid = await this.fcmService.validateToken(dto.token);
      if (!isValid) {
        this.logger.warn(`Invalid FCM token provided by user ${userId}`);
        // Still save it, but mark as inactive - will be cleaned up later
      }

      // Create new token
      deviceToken = this.deviceTokenRepo.create({
        user: { id: userId } as any,
        token: dto.token,
        platform: dto.platform,
        deviceId: dto.deviceId,
        appVersion: dto.appVersion,
        isActive: isValid,
      });
      deviceToken = await this.deviceTokenRepo.save(deviceToken);
      this.logger.log(`Registered new device token for user ${userId}`);
    }

    return deviceToken;
  }

  /**
   * Get all active device tokens for a user
   */
  async getUserTokens(userId: string): Promise<DeviceToken[]> {
    const tokens = await this.deviceTokenRepo.find({
      where: {
        user: { id: userId },
        isActive: true,
      },
    });
    // Most recently used first, never-used tokens last, newest first within ties.
    // Sorted here because engines disagree on where NULL sorts.
    const time = (date: Date | null | undefined) => (date ? new Date(date).getTime() : -Infinity);
    return tokens.sort(
      (a, b) => time(b.lastUsedAt) - time(a.lastUsedAt) || time(b.createdAt) - time(a.createdAt),
    );
  }

  /**
   * Remove a device token
   */
  async removeToken(userId: string, tokenId: string): Promise<void> {
    const deviceToken = await this.deviceTokenRepo.findOne({
      where: {
        id: tokenId,
        user: { id: userId },
      },
    });

    if (!deviceToken) {
      throw new NotFoundException('Device token not found');
    }

    await this.deviceTokenRepo.remove(deviceToken);
    this.logger.log(`Removed device token ${tokenId} for user ${userId}`);
  }

  /**
   * Get all active tokens for a user (internal use)
   */
  async getActiveTokensForUser(userId: string): Promise<DeviceToken[]> {
    return this.deviceTokenRepo.find({
      where: {
        user: { id: userId },
        isActive: true,
      },
    });
  }
}

