import { JsonColumn } from 'src/shared/decorators/portable-column.decorator';

/**
 * Shared tenant-domain base fields.
 * Stores per-tenant extensible attributes without schema changes.
 */
export abstract class TenantBaseEntity {
  @JsonColumn({ nullable: true })
  customFields?: Record<string, unknown>;
}
