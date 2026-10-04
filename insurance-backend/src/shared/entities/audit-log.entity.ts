import { CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { IntColumn, JsonColumn, StringColumn } from 'src/shared/decorators/portable-column.decorator';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The action performed, e.g. 'tenant.create', 'tenant.onboard', 'migration.run' */
  @StringColumn(120)
  action: string;

  /** ID of the admin who performed the action (from JWT sub) */
  @StringColumn(255, { nullable: true })
  adminId?: string;

  /** Resource type, e.g. 'tenant', 'plugin', 'migration' */
  @StringColumn(80, { nullable: true })
  resourceType?: string;

  /** ID of the resource affected */
  @StringColumn(255, { nullable: true })
  resourceId?: string;

  /** HTTP method */
  @StringColumn(10, { nullable: true })
  method?: string;

  /** Request path */
  @StringColumn(500, { nullable: true })
  path?: string;

  /** Snapshot of the request body (redacted of sensitive fields) */
  @JsonColumn({ nullable: true })
  payload?: Record<string, unknown>;

  /** HTTP status code of the response */
  @IntColumn({ nullable: true })
  statusCode?: number;

  /** IP address of the caller */
  @StringColumn(45, { nullable: true })
  ipAddress?: string;

  @CreateDateColumn()
  createdAt: Date;
}
