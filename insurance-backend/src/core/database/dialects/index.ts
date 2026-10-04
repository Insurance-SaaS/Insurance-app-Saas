import { DatabaseDialect, DatabaseEngine, SUPPORTED_ENGINES } from './database-dialect';
import { MssqlDialect } from './mssql.dialect';
import { MysqlDialect } from './mysql.dialect';
import { OracleDialect } from './oracle.dialect';
import { PostgresDialect } from './postgres.dialect';

export * from './database-dialect';

const DIALECTS: Record<DatabaseEngine, DatabaseDialect> = {
  postgres: new PostgresDialect(),
  mysql: new MysqlDialect('mysql'),
  mariadb: new MysqlDialect('mariadb'),
  oracle: new OracleDialect(),
  mssql: new MssqlDialect(),
};

export function isSupportedEngine(engine: string | undefined | null): engine is DatabaseEngine {
  return SUPPORTED_ENGINES.includes((engine ?? '').toLowerCase() as DatabaseEngine);
}

export function getDialect(engine: string | undefined | null): DatabaseDialect {
  const normalized = (engine ?? '').trim().toLowerCase();
  if (!isSupportedEngine(normalized)) {
    throw new Error(
      `Unsupported database engine "${engine}". Supported: ${SUPPORTED_ENGINES.join(', ')}`,
    );
  }
  return DIALECTS[normalized];
}
