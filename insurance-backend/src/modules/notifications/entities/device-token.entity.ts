import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';
import { TenantBaseEntity } from 'src/shared/entities/tenant-base.entity';
import { BooleanColumn, InstantColumn, StringColumn } from 'src/shared/decorators/portable-column.decorator';

@Entity('device_tokens')
@Index(['user', 'token'], { unique: true }) // One token per user
@Index(['token']) // For quick token lookups
export class DeviceToken extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: true })
  user: User;

  // FCM tokens are typically 152-200 chars, max ~4000 chars
  // Using VARCHAR2(4000) for Oracle (indexable) vs CLOB (not indexable)
  // Indexed twice: 512 characters stays inside the index key limits of MySQL and SQL Server.
  @StringColumn(512)
  token: string; // FCM registration token

  @StringColumn(20)
  platform: 'ios' | 'android' | 'web';

  @StringColumn(100, { nullable: true })
  deviceId: string | null; // Optional: for device management

  @StringColumn(50, { nullable: true })
  appVersion: string | null;

  @BooleanColumn({ default: true })
  isActive: boolean; // Mark invalid tokens as inactive

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @InstantColumn({ nullable: true })
  lastUsedAt: Date | null; // Track last successful push
}
