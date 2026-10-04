import { Exclude } from 'class-transformer';
import {
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantBaseEntity } from 'src/shared/entities/tenant-base.entity';
import { DecimalColumn, EnumColumn, InstantColumn, StringColumn, UuidColumn } from 'src/shared/decorators/portable-column.decorator';

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
}

export enum PaymentMethod {
  BANK_TRANSFER = 'bank_transfer',
  CREDIT_CARD = 'credit_card',
  CASH = 'cash',
  CHECK = 'check',
  MOBILE = 'mobile',
}

@Entity('payment_transactions')
@Index(['userId'])
// One payment per idempotency key; payments without a key are not constrained.
// A single column on purpose: a two-column unique index treats (user, NULL) as
// a duplicate on Oracle, which would allow one key-less payment per user.
@Index(['idempotencyKey'], { unique: true, where: '"idempotencyKey" IS NOT NULL' })
export class PaymentTransaction extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Reference number visible to the customer */
  @StringColumn(50, { unique: true })
  referenceNumber: string;

  /** The user/policyholder who is paying */
  @UuidColumn()
  userId: string;

  /** Optional link to a quote / policy */
  @UuidColumn({ nullable: true })
  quoteId?: string;

  /** Optional link to a claim (e.g. deductible payment) */
  @UuidColumn({ nullable: true })
  claimId?: string;

  @DecimalColumn(12, 2)
  amount: number;

  @StringColumn(3, { default: 'DZD' })
  currency: string;

  @EnumColumn(PaymentStatus, { default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @EnumColumn(PaymentMethod, { default: PaymentMethod.BANK_TRANSFER })
  method: PaymentMethod;

  /** Description / memo */
  @StringColumn(1000, { nullable: true })
  description?: string;

  /** External gateway transaction ID (Stripe, CIB, etc.) */
  @StringColumn(255, { nullable: true })
  gatewayTransactionId?: string;

  /**
   * Digest of the payer and of the key the client chose, so a retried request
   * does not create a second payment. Two users may choose the same key.
   */
  @Exclude()
  @StringColumn(64, { nullable: true })
  idempotencyKey?: string | null;

  /** Date the payment was completed */
  @InstantColumn({ nullable: true })
  paidAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
