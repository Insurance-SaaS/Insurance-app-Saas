import { DataSource, DataSourceOptions } from 'typeorm';
import {
  assertSafeDatabaseName,
  ConnectionSettings,
  DatabaseDialect,
  driverErrorOf,
} from './database-dialect';

/** MySQL and MariaDB share a driver and almost all behaviour. */
export class MysqlDialect implements DatabaseDialect {
  readonly defaultPort = 3306;
  readonly pingQuery = 'SELECT 1';
  readonly canCreateDatabase = true;

  constructor(readonly engine: 'mysql' | 'mariadb') {}

  connectionOptions(settings: ConnectionSettings, poolSize: number): DataSourceOptions {
    return {
      type: this.engine,
      host: settings.host,
      port: settings.port ?? this.defaultPort,
      username: settings.username,
      password: settings.password,
      database: settings.database,
      ssl: settings.options?.ssl ? {} : undefined,
      poolSize,
      // Full Unicode (Arabic, emoji) and UTC for every date the driver reads or writes.
      charset: 'utf8mb4',
      timezone: 'Z',
      connectTimeout: 10_000,
    };
  }

  isUniqueViolation(error: unknown): boolean {
    const e = driverErrorOf(error);
    return e.errno === 1062 || e.code === 'ER_DUP_ENTRY';
  }

  async databaseExists(server: DataSource, name: string): Promise<boolean> {
    const rows = await server.query(
      'SELECT 1 FROM information_schema.schemata WHERE schema_name = ?',
      [name],
    );
    return rows.length > 0;
  }

  async createDatabase(server: DataSource, name: string): Promise<void> {
    assertSafeDatabaseName(name);
    await server.query(
      `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  }
}
