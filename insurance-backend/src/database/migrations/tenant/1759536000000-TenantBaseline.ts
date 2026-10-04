import { MigrationInterface } from 'typeorm';

/**
 * Marks the starting point of a tenant database's schema history.
 *
 * A new tenant database is created from the entity definitions (see
 * SchemaManager) and this migration is recorded as applied. Later migrations
 * describe every change after this point, using SchemaKit.
 */
export class TenantBaseline1759536000000 implements MigrationInterface {
  name = 'TenantBaseline1759536000000';

  async up(): Promise<void> {
    // The schema already exists when this is recorded.
  }

  async down(): Promise<void> {
    // The baseline cannot be reverted; drop the database instead.
  }
}
