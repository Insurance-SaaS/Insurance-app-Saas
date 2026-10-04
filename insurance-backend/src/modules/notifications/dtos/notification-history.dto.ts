import { IsOptional, IsIn, IsBoolean, IsInt, Min, Max, IsUUID, IsArray, ArrayMaxSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { NotificationType } from '../entities/notification.entity';

export class GetNotificationsQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by read status',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isRead?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by notification type',
    enum: NotificationType,
  })
  @IsOptional()
  @IsIn(Object.values(NotificationType))
  type?: NotificationType;
}

export class NotificationResponseDto {
  @ApiProperty({ description: 'Notification ID' })
  id: string;

  @ApiProperty({ description: 'Notification title' })
  title: string;

  @ApiProperty({ description: 'Notification body' })
  body: string;

  @ApiPropertyOptional({ description: 'Image URL' })
  imageUrl?: string;

  @ApiProperty({ description: 'Notification type', enum: NotificationType })
  type: NotificationType;

  @ApiProperty({ description: 'Read status' })
  isRead: boolean;

  @ApiPropertyOptional({ description: 'Read timestamp' })
  readAt?: Date;

  @ApiPropertyOptional({ description: 'Additional data payload' })
  data?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Reference ID (e.g., claim ID)' })
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Reference type (e.g., claim, policy)' })
  referenceType?: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;
}

export class PaginatedNotificationsResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  items: NotificationResponseDto[];

  @ApiProperty({ description: 'Total number of notifications' })
  total: number;

  @ApiProperty({ description: 'Current page' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;

  @ApiProperty({ description: 'Total pages' })
  totalPages: number;

  @ApiProperty({ description: 'Number of unread notifications' })
  unreadCount: number;
}

export class MarkNotificationsReadDto {
  @ApiProperty({
    description: 'Array of notification IDs to mark as read',
    type: [String],
  })
  @IsArray()
  // Oracle allows 1000 items in an IN list and SQL Server 2100 parameters.
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  notificationIds: string[];
}

export class UnreadCountResponseDto {
  @ApiProperty({ description: 'Number of unread notifications' })
  unreadCount: number;
}

