import { MigrationInterface } from 'typeorm';

/**
 * Marks the starting point of the platform database's schema history.
 *
 * A new database is created from the entity definitions (see SchemaManager) and
 * this migration is recorded as applied. Later migrations describe every change
 * after this point, using SchemaKit.
 */
export class PlatformBaseline1759536000000 implements MigrationInterface {
  name = 'PlatformBaseline1759536000000';

  async up(): Promise<void> {
    // The schema already exists when this is recorded.
  }

  async down(): Promise<void> {
    // The baseline cannot be reverted; drop the database instead.
  }
}
