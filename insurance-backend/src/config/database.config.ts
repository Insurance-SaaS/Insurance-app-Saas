import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ConnectionSettings, DatabaseEngine, getDialect } from 'src/core/database/dialects';
import { PLATFORM_ENTITIES, PLATFORM_MIGRATIONS_TABLE } from 'src/core/database/entity-sets';
import { SchemaManager } from 'src/core/database/schema/schema-manager';
import { PLATFORM_MIGRATIONS } from 'src/database/migrations';

type Env = (key: string) => string | undefined;

/** Legacy per-engine variable prefixes, still honoured after the generic DB_* names. */
const LEGACY_PREFIX: Record<DatabaseEngine, string> = {
  postgres: 'POSTGRES',
  mysql: 'MYSQL',
  mariadb: 'MYSQL',
  oracle: 'ORACLE',
  mssql: 'MSSQL',
};

export function platformEngine(env: Env): DatabaseEngine {
  return getDialect(env('DB_TYPE') || 'postgres').engine;
}

/**
 * Connection settings of the platform (control-plane) database.
 * DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME work for every engine.
 */
export function platformConnectionSettings(env: Env): ConnectionSettings {
  const prefix = LEGACY_PREFIX[platformEngine(env)];
  const read = (generic: string, ...legacy: string[]) =>
    [env(generic), ...legacy.map((name) => env(`${prefix}_${name}`))].find(Boolean);

  const port = read('DB_PORT', 'PORT');
  return {
    host: read('DB_HOST', 'HOST') || 'localhost',
    port: port ? Number.parseInt(port, 10) : undefined,
    username: read('DB_USER', 'USER') ?? '',
    password: read('DB_PASSWORD', 'PASSWORD'),
    database: read('DB_NAME', 'DB', 'NAME') ?? '',
    options: {
      ssl: env('DB_SSL') === 'true',
      encrypt: env('MSSQL_ENCRYPT') !== 'false',
      trustServerCertificate: env('MSSQL_TRUST_CERT') === 'true',
    },
  };
}

export function platformDataSourceOptions(env: Env): DataSourceOptions {
  const dialect = getDialect(platformEngine(env));
  return {
    ...dialect.connectionOptions(
      platformConnectionSettings(env),
      Number.parseInt(env('DB_POOL_SIZE') || '10', 10),
    ),
    entities: PLATFORM_ENTITIES,
    migrations: PLATFORM_MIGRATIONS,
    migrationsTableName: PLATFORM_MIGRATIONS_TABLE,
    // The schema only changes through SchemaManager (provisioning and migrations).
    synchronize: false,
    logging: env('DB_LOGGING') === 'true',
  } as DataSourceOptions;
}

export function createDatabaseConfig(configService: ConfigService): TypeOrmModuleOptions {
  return platformDataSourceOptions((key) => configService.get<string>(key));
}

/**
 * Opens the platform database. With DB_AUTO_MIGRATE=true it is first brought to
 * the current schema, which is convenient for development and tests; in
 * production run the migrate CLI as a deployment step instead.
 */
export async function createPlatformDataSource(options: DataSourceOptions): Promise<DataSource> {
  const dataSource = await new DataSource(options).initialize();
  if (process.env.DB_AUTO_MIGRATE === 'true') {
    await new SchemaManager().ensureCurrent(dataSource);
  }
  return dataSource;
}
