import { CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { BooleanColumn, JsonColumn, StringColumn, UuidColumn } from 'src/shared/decorators/portable-column.decorator';

/**
 * Per-tenant plugin state.
 *
 * Each row records whether a plugin (identified by its @insurance/ ID)
 * is enabled for a specific tenant, along with optional config overrides.
 *
 * Table name kept as 'component_registry' for backward compatibility
 * with existing data.
 */
@Entity('component_registry')
@Index(['tenantId', 'componentName'], { unique: true })
export class TenantPlugin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @UuidColumn()
  @Index()
  tenantId: string;

  /**
   * Plugin identifier. New rows use the full @insurance/<name> format.
   * Legacy rows may still contain short names (e.g. 'claims').
   * The PluginRegistryService handles both transparently.
   */
  @StringColumn(80)
  componentName: string;

  @BooleanColumn({ default: true })
  isEnabled: boolean;

  @JsonColumn({ nullable: true })
  config?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
