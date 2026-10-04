import { DataSource, DataSourceOptions } from 'typeorm';
import {
  assertSafeDatabaseName,
  ConnectionSettings,
  DatabaseDialect,
  driverErrorOf,
} from './database-dialect';

export class MssqlDialect implements DatabaseDialect {
  readonly engine = 'mssql' as const;
  readonly defaultPort = 1433;
  readonly pingQuery = 'SELECT 1';
  readonly canCreateDatabase = true;

  connectionOptions(settings: ConnectionSettings, poolSize: number): DataSourceOptions {
    return {
      type: 'mssql',
      host: settings.host,
      port: settings.port ?? this.defaultPort,
      username: settings.username,
      password: settings.password,
      database: settings.database,
      pool: { max: poolSize, min: 0, idleTimeoutMillis: 30_000 },
      options: {
        encrypt: settings.options?.encrypt !== false,
        trustServerCertificate: settings.options?.trustServerCertificate === true,
        useUTC: true,
      },
      connectionTimeout: 10_000,
    };
  }

  isUniqueViolation(error: unknown): boolean {
    const number = driverErrorOf(error).number;
    return number === 2627 || number === 2601;
  }

  async databaseExists(server: DataSource, name: string): Promise<boolean> {
    const rows = await server.query('SELECT 1 AS found FROM sys.databases WHERE name = @0', [name]);
    return rows.length > 0;
  }

  async createDatabase(server: DataSource, name: string): Promise<void> {
    assertSafeDatabaseName(name);
    await server.query(`CREATE DATABASE [${name}]`);
  }
}
