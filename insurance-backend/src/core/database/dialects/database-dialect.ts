import { DataSource, DataSourceOptions } from 'typeorm';

export type DatabaseEngine = 'postgres' | 'mysql' | 'mariadb' | 'oracle' | 'mssql';

export const SUPPORTED_ENGINES: DatabaseEngine[] = ['postgres', 'mysql', 'mariadb', 'oracle', 'mssql'];

/** Where a database is and how to log in. The same shape for every engine. */
export interface ConnectionSettings {
  host: string;
  port?: number;
  username: string;
  password?: string;
  /** Database name. For Oracle this is the service name. */
  database: string;
  /** Engine-specific extras, e.g. { sid }, { ssl: true }, { encrypt: true }. */
  options?: Record<string, unknown>;
}

/**
 * Everything the platform needs to know about one database engine. This is the
 * only place that may contain engine-specific options or SQL; the rest of the
 * code talks to TypeORM in engine-neutral terms.
 */
export interface DatabaseDialect {
  readonly engine: DatabaseEngine;
  readonly defaultPort: number;

  /** The cheapest statement that proves the server answers. */
  readonly pingQuery: string;

  /** TypeORM connection options: driver, pool, character set, time zone. */
  connectionOptions(settings: ConnectionSettings, poolSize: number): DataSourceOptions;

  /** True if the error means a unique constraint or unique index was violated. */
  isUniqueViolation(error: unknown): boolean;

  /**
   * Whether the platform can create a database itself on this engine
   * ("managed" tenants). Where it cannot, the tenant brings its own database.
   */
  readonly canCreateDatabase: boolean;
  databaseExists(server: DataSource, name: string): Promise<boolean>;
  createDatabase(server: DataSource, name: string): Promise<void>;
}

/** Database names created by the platform are restricted to a safe alphabet. */
export function assertSafeDatabaseName(name: string): void {
  if (!/^[a-z][a-z0-9_]{0,62}$/i.test(name)) {
    throw new Error(`Unsafe database name: "${name}"`);
  }
}

/** Driver errors are sometimes wrapped by TypeORM's QueryFailedError. */
export function driverErrorOf(error: unknown): Record<string, any> {
  const e = (error ?? {}) as Record<string, any>;
  return (e.driverError as Record<string, any>) ?? e;
}
