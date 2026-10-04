import { DataSourceOptions } from 'typeorm';
import { ConnectionSettings, DatabaseDialect, driverErrorOf } from './database-dialect';

/**
 * Oracle. A tenant on Oracle always brings its own schema: creating one needs
 * DBA privileges (CREATE USER plus grants) that the platform account should not hold.
 */
export class OracleDialect implements DatabaseDialect {
  readonly engine = 'oracle' as const;
  readonly defaultPort = 1521;
  readonly pingQuery = 'SELECT 1 FROM DUAL';
  readonly canCreateDatabase = false;

  connectionOptions(settings: ConnectionSettings, poolSize: number): DataSourceOptions {
    const sid = settings.options?.sid as string | undefined;
    return {
      type: 'oracle',
      host: settings.host,
      port: settings.port ?? this.defaultPort,
      username: settings.username,
      password: settings.password,
      ...(sid ? { sid } : { serviceName: settings.database }),
      poolSize,
      extra: {
        // Every pooled session: lengths count characters (so a 255-character
        // Arabic string fits a 255-length column) and dates are UTC.
        sessionCallback: (connection: any, _tag: string, done: (error?: Error) => void) => {
          connection
            .execute("ALTER SESSION SET NLS_LENGTH_SEMANTICS = 'CHAR' TIME_ZONE = 'UTC'")
            .then(() => done())
            .catch(done);
        },
      },
    };
  }

  isUniqueViolation(error: unknown): boolean {
    const e = driverErrorOf(error);
    return e.errorNum === 1 || String(e.message ?? '').includes('ORA-00001');
  }

  databaseExists(): Promise<boolean> {
    return Promise.reject(new Error('Oracle tenants bring their own schema'));
  }

  createDatabase(): Promise<void> {
    return Promise.reject(new Error('Oracle tenants bring their own schema'));
  }
}
