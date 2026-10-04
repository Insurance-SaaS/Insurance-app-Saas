import { Injectable, Logger } from '@nestjs/common';
import { DataSource, MigrationExecutor } from 'typeorm';

export interface SchemaReport {
  /** 'provisioned': an empty database was given the current schema. 'migrated': pending migrations were applied. */
  mode: 'provisioned' | 'migrated';
  /** Migrations recorded during this run. */
  applied: string[];
  /** Name of the newest migration recorded in the database. */
  version: string | null;
  /**
   * DDL statements still needed for the database to match the entities.
   * Empty means the schema is exactly what the code expects.
   */
  drift: string[];
}

/**
 * Creates and upgrades database schemas the same way on every engine.
 *
 * - A database that has never been set up gets the current schema straight from
 *   the entity definitions (TypeORM generates the DDL for that engine), and every
 *   known migration is recorded as already applied.
 * - A database that was set up before only runs the migrations it has not seen.
 *   Migrations are written with SchemaKit, which is engine-neutral and safe to re-run.
 *
 * Nothing else may change a schema: `synchronize` is off on every DataSource.
 */
@Injectable()
export class SchemaManager {
  private readonly logger = new Logger(SchemaManager.name);

  async ensureCurrent(dataSource: DataSource): Promise<SchemaReport> {
    const provisioned = await this.isProvisioned(dataSource);

    let applied: string[];
    if (provisioned) {
      const migrations = await dataSource.runMigrations({ transaction: 'each' });
      applied = migrations.map((m) => m.name);
    } else {
      await this.assertEmpty(dataSource);
      await dataSource.synchronize();
      // Record every migration as applied without running it: the schema is already current.
      const stamped = await dataSource.runMigrations({ fake: true, transaction: 'none' });
      applied = stamped.map((m) => m.name);
    }

    return {
      mode: provisioned ? 'migrated' : 'provisioned',
      applied,
      version: await this.currentVersion(dataSource),
      drift: await this.drift(dataSource),
    };
  }

  /** The DDL TypeORM would run to make the database match the entities. */
  async drift(dataSource: DataSource): Promise<string[]> {
    const sql = await dataSource.driver.createSchemaBuilder().log();
    return sql.upQueries.map((q) => q.query);
  }

  async currentVersion(dataSource: DataSource): Promise<string | null> {
    if (!(await this.isProvisioned(dataSource))) {
      return null;
    }
    const executed = await new MigrationExecutor(dataSource).getExecutedMigrations();
    return executed.length ? executed[0].name : null;
  }

  /**
   * Reverts migrations, newest first, until `version` is the newest one recorded.
   * Returns the names of the migrations that were reverted.
   */
  async revertTo(dataSource: DataSource, version: string): Promise<string[]> {
    const known = dataSource.migrations.map((m) => m.name ?? m.constructor.name);
    if (!known.includes(version)) {
      throw new Error(`Unknown migration "${version}"`);
    }

    const reverted: string[] = [];
    for (;;) {
      const current = await this.currentVersion(dataSource);
      if (!current || current === version) {
        return reverted;
      }
      await dataSource.undoLastMigration({ transaction: 'each' });
      reverted.push(current);
      this.logger.log(`Reverted migration ${current}`);
    }
  }

  private migrationsTable(dataSource: DataSource): string {
    return dataSource.options.migrationsTableName ?? 'migrations';
  }

  private async isProvisioned(dataSource: DataSource): Promise<boolean> {
    const queryRunner = dataSource.createQueryRunner();
    try {
      return await queryRunner.hasTable(this.migrationsTable(dataSource));
    } finally {
      await queryRunner.release();
    }
  }

  /** Refuses to set up a database that already holds tables we did not create. */
  private async assertEmpty(dataSource: DataSource): Promise<void> {
    const queryRunner = dataSource.createQueryRunner();
    try {
      for (const metadata of dataSource.entityMetadatas) {
        if (await queryRunner.hasTable(metadata.tablePath)) {
          throw new Error(
            `Database already contains a "${metadata.tableName}" table but was not set up by this ` +
              'platform. Use an empty database or schema.',
          );
        }
      }
    } finally {
      await queryRunner.release();
    }
  }
}
