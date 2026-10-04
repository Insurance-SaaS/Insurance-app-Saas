import { Exclude } from 'class-transformer';
import { CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import {
  BooleanColumn,
  InstantColumn,
  IntColumn,
  JsonColumn,
  StringColumn,
} from 'src/shared/decorators/portable-column.decorator';

export type TenantProvisioningMode = 'managed' | 'byod';

export type TenantProvisioningStatus =
  | 'pending'
  | 'database_ready'
  | 'schema_ready'
  | 'admin_seeded'
  | 'active'
  | 'failed';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @StringColumn(120, { unique: true })
  slug: string;

  @StringColumn()
  name: string;

  @BooleanColumn({ default: true })
  isActive: boolean;

  @StringColumn(20, { nullable: true })
  databaseType?: string;

  @StringColumn(255, { nullable: true })
  databaseHost?: string;

  @IntColumn({ nullable: true })
  databasePort?: number;

  @StringColumn(255, { nullable: true })
  databaseName?: string;

  @StringColumn(255, { nullable: true })
  databaseUsername?: string;

  // Stored encrypted (see TenantService) and never serialised into a response.
  @StringColumn(255, { nullable: true })
  @Exclude()
  databasePassword?: string;

  /** Engine-specific connection extras: { sid }, { ssl }, { encrypt }, { poolSize }. */
  @JsonColumn({ nullable: true })
  databaseOptions?: Record<string, any> | null;

  /** 'managed': the platform created the database. 'byod': the tenant brought its own. */
  @StringColumn(20, { default: 'managed' })
  provisioningMode: TenantProvisioningMode;

  /** Where onboarding stands; anything but 'active' means the tenant is not usable yet. */
  @StringColumn(30, { default: 'active' })
  provisioningStatus: TenantProvisioningStatus;

  @StringColumn(1000, { nullable: true })
  provisioningError?: string | null;

  /** Newest migration recorded in the tenant database at the last schema run. */
  @StringColumn(120, { nullable: true })
  schemaVersion?: string | null;

  @InstantColumn({ nullable: true })
  schemaCheckedAt?: Date | null;

  /** Number of DDL statements the tenant database was missing at the last check (0 = in sync). */
  @IntColumn({ nullable: true })
  schemaDrift?: number | null;

  /** Set while a schema run is in progress, so two runs never overlap. */
  @InstantColumn({ nullable: true })
  migrationLockUntil?: Date | null;

  @JsonColumn({ nullable: true })
  config?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
