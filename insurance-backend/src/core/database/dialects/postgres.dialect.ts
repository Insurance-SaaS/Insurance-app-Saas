import { DataSource, DataSourceOptions } from 'typeorm';
import {
  assertSafeDatabaseName,
  ConnectionSettings,
  DatabaseDialect,
  driverErrorOf,
} from './database-dialect';

export class PostgresDialect implements DatabaseDialect {
  readonly engine = 'postgres' as const;
  readonly defaultPort = 5432;
  readonly pingQuery = 'SELECT 1';
  readonly canCreateDatabase = true;

  connectionOptions(settings: ConnectionSettings, poolSize: number): DataSourceOptions {
    return {
      type: 'postgres',
      host: settings.host,
      port: settings.port ?? this.defaultPort,
      username: settings.username,
      password: settings.password,
      database: settings.database,
      ssl: settings.options?.ssl ? { rejectUnauthorized: settings.options.ssl !== 'insecure' } : false,
      poolSize,
      // gen_random_uuid() is built in since PostgreSQL 13, so a tenant that brings its
      // own database does not need the right to create extensions.
      uuidExtension: 'pgcrypto',
      installExtensions: false,
      extra: { idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 },
    };
  }

  isUniqueViolation(error: unknown): boolean {
    return driverErrorOf(error).code === '23505';
  }

  async databaseExists(server: DataSource, name: string): Promise<boolean> {
    const rows = await server.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    return rows.length > 0;
  }

  async createDatabase(server: DataSource, name: string): Promise<void> {
    assertSafeDatabaseName(name);
    await server.query(`CREATE DATABASE "${name}"`);
  }
}
