import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';
import { TenantBaseEntity } from 'src/shared/entities/tenant-base.entity';
import { BooleanColumn, InstantColumn, JsonColumn, LongTextColumn, StringColumn } from 'src/shared/decorators/portable-column.decorator';

export enum NotificationType {
  CLAIM_UPDATE = 'claim_update',
  POLICY_RENEWAL = 'policy_renewal',
  PAYMENT_REMINDER = 'payment_reminder',
  DOCUMENT_READY = 'document_ready',
  PROMOTION = 'promotion',
  SYSTEM = 'system',
  TEST = 'test',
  GENERAL = 'general',
}

export enum NotificationStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
}

@Entity('notifications')
@Index(['user', 'createdAt'])
@Index(['user', 'isRead'])
export class Notification extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  user: User;

  @StringColumn(255)
  title: string;

  @LongTextColumn()
  body: string;

  @StringColumn(500, { nullable: true })
  imageUrl: string | null;

  @StringColumn(50, { default: NotificationType.GENERAL })
  type: NotificationType;

  @StringColumn(20, { default: NotificationStatus.SENT })
  status: NotificationStatus;

  @BooleanColumn({ default: false })
  isRead: boolean;

  @InstantColumn({ nullable: true })
  readAt: Date | null;

  // Store additional data payload as JSON string
  @JsonColumn({ nullable: true })
  data: Record<string, any> | null;

  // Reference to related entity (e.g., claim ID, policy ID)
  @StringColumn(100, { nullable: true })
  referenceId: string | null;

  @StringColumn(50, { nullable: true })
  referenceType: string | null; // 'claim', 'policy', 'payment', etc.

  @CreateDateColumn()
  createdAt: Date;

  // Helper method to get parsed data
  getDataPayload(): Record<string, any> | null {
    return this.data ?? null;
  }
}

