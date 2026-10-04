import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { FcmService } from './services/fcm.service';
import { RegisterDeviceTokenDto } from './dtos/register-device-token.dto';
import { DeviceTokenService } from './services/device-token.service';
import { NotificationHistoryService } from './services/notification-history.service';
import {
  GetNotificationsQueryDto,
  PaginatedNotificationsResponseDto,
  NotificationResponseDto,
  MarkNotificationsReadDto,
  UnreadCountResponseDto,
} from './dtos/notification-history.dto';
import { NotificationType } from './entities/notification.entity';
import { RequiresPlugin } from 'src/core/plugin-registry/decorators/requires-plugin.decorator';

@ApiTags('Notifications')
@Controller('notifications')
@RequiresPlugin('@insurance/notifications')
@ApiBearerAuth()
export class NotificationsController {
  constructor(
    private readonly fcmService: FcmService,
    private readonly deviceTokenService: DeviceTokenService,
    private readonly notificationHistoryService: NotificationHistoryService,
  ) {}

  // ==================== NOTIFICATION HISTORY ENDPOINTS ====================

  @Get()
  @ApiOperation({ summary: 'Get notification history with pagination' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of notifications',
    type: PaginatedNotificationsResponseDto,
  })
  async getNotifications(
    @Query() query: GetNotificationsQueryDto,
    @Request() req: any,
  ): Promise<PaginatedNotificationsResponseDto> {
    const userId = req.user.id;
    return this.notificationHistoryService.getUserNotifications(userId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get count of unread notifications' })
  @ApiResponse({
    status: 200,
    description: 'Unread notifications count',
    type: UnreadCountResponseDto,
  })
  async getUnreadCount(@Request() req: any): Promise<UnreadCountResponseDto> {
    const userId = req.user.id;
    const unreadCount = await this.notificationHistoryService.getUnreadCount(userId);
    return { unreadCount };
  }

  @Get(':notificationId')
  @ApiOperation({ summary: 'Get a single notification by ID' })
  @ApiParam({ name: 'notificationId', description: 'Notification UUID' })
  @ApiResponse({
    status: 200,
    description: 'Notification details',
    type: NotificationResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async getNotification(
    @Param('notificationId') notificationId: string,
    @Request() req: any,
  ): Promise<NotificationResponseDto> {
    const userId = req.user.id;
    return this.notificationHistoryService.getNotificationById(userId, notificationId);
  }

  @Patch(':notificationId/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'notificationId', description: 'Notification UUID' })
  @ApiResponse({
    status: 200,
    description: 'Notification marked as read',
    type: NotificationResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markAsRead(
    @Param('notificationId') notificationId: string,
    @Request() req: any,
  ): Promise<NotificationResponseDto> {
    const userId = req.user.id;
    return this.notificationHistoryService.markAsRead(userId, notificationId);
  }

  @Patch('read/bulk')
  @ApiOperation({ summary: 'Mark multiple notifications as read' })
  @ApiResponse({
    status: 200,
    description: 'Number of notifications marked as read',
  })
  async markMultipleAsRead(
    @Body() dto: MarkNotificationsReadDto,
    @Request() req: any,
  ): Promise<{ updated: number }> {
    const userId = req.user.id;
    return this.notificationHistoryService.markMultipleAsRead(userId, dto.notificationIds);
  }

  @Patch('read/all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({
    status: 200,
    description: 'Number of notifications marked as read',
  })
  async markAllAsRead(@Request() req: any): Promise<{ updated: number }> {
    const userId = req.user.id;
    return this.notificationHistoryService.markAllAsRead(userId);
  }

  @Delete(':notificationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a notification' })
  @ApiParam({ name: 'notificationId', description: 'Notification UUID' })
  @ApiResponse({ status: 204, description: 'Notification deleted' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async deleteNotification(
    @Param('notificationId') notificationId: string,
    @Request() req: any,
  ): Promise<void> {
    const userId = req.user.id;
    await this.notificationHistoryService.deleteNotification(userId, notificationId);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete all notifications' })
  @ApiResponse({
    status: 200,
    description: 'Number of notifications deleted',
  })
  async deleteAllNotifications(@Request() req: any): Promise<{ deleted: number }> {
    const userId = req.user.id;
    return this.notificationHistoryService.deleteAllNotifications(userId);
  }

  // ==================== DEVICE TOKEN ENDPOINTS ====================

  @Post('device-tokens')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register or update device token for push notifications' })
  @ApiResponse({ status: 201, description: 'Device token registered successfully' })
  async registerDeviceToken(@Body() registerDto: RegisterDeviceTokenDto, @Request() req: any) {
    const userId = req.user.id;
    return this.deviceTokenService.registerToken(userId, registerDto);
  }

  @Get('device-tokens')
  @ApiOperation({ summary: "Get user's registered devices" })
  @ApiResponse({ status: 200, description: 'List of registered devices' })
  async getDeviceTokens(@Request() req: any) {
    const userId = req.user.id;
    return this.deviceTokenService.getUserTokens(userId);
  }

  @Delete('device-tokens/:tokenId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unregister a device token' })
  @ApiResponse({ status: 204, description: 'Device token removed successfully' })
  async unregisterDeviceToken(@Param('tokenId') tokenId: string, @Request() req: any) {
    const userId = req.user.id;
    await this.deviceTokenService.removeToken(userId, tokenId);
  }

  // ==================== TEST ENDPOINT ====================

  @Post('test')
  @ApiOperation({ summary: 'Send a test notification to current user' })
  @ApiResponse({ status: 200, description: 'Test notification sent' })
  async sendTestNotification(@Request() req: any) {
    const userId = req.user.id;
    const result = await this.fcmService.sendToUser(
      userId,
      {
        title: 'Test Notification',
        body: 'This is a test notification from your insurance app!',
      },
      {
        type: 'test',
        timestamp: new Date().toISOString(),
      },
      { type: NotificationType.TEST },
    );
    return {
      message: 'Test notification sent',
      result,
    };
  }
}
