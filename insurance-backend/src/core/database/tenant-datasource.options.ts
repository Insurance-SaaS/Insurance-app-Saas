import { createHash } from 'node:crypto';
import { DataSourceOptions } from 'typeorm';
import { Tenant } from 'src/core/tenant/entities/tenant.entity';
import { decryptCredential, isEncrypted } from 'src/shared/utils/credential-encryption.util';
import { TENANT_MIGRATIONS } from 'src/database/migrations';
import { ConnectionSettings, getDialect } from './dialects';
import { TENANT_ENTITIES, TENANT_MIGRATIONS_TABLE } from './entity-sets';

const DEFAULT_POOL_SIZE = 5;

/**
 * Connection settings of a tenant's own database, taken only from the tenant
 * record. There is no fallback to the platform's credentials: a tenant without
 * its own connection details must not silently end up in another database.
 */
export function tenantConnectionSettings(tenant: Tenant): ConnectionSettings {
  const missing = (['databaseType', 'databaseHost', 'databaseName', 'databaseUsername'] as const)
    .filter((field) => !tenant[field]);
  if (missing.length) {
    throw new Error(
      `Tenant "${tenant.slug}" has no database connection configured (missing: ${missing.join(', ')})`,
    );
  }

  let password = tenant.databasePassword;
  if (password && isEncrypted(password)) {
    const key = process.env.TENANT_DB_ENCRYPTION_KEY;
    if (!key) {
      throw new Error(
        `Tenant "${tenant.slug}" has an encrypted database password but TENANT_DB_ENCRYPTION_KEY is not set`,
      );
    }
    // A wrong key must fail here, not turn the ciphertext into a "password".
    password = decryptCredential(password, key);
  }

  return {
    host: tenant.databaseHost!,
    port: tenant.databasePort ?? undefined,
    username: tenant.databaseUsername!,
    password,
    database: tenant.databaseName!,
    options: tenant.databaseOptions ?? {},
  };
}

export function tenantDataSourceOptions(
  tenant: Tenant,
  extraEntities: Function[] = [],
): DataSourceOptions {
  const dialect = getDialect(tenant.databaseType);
  const poolSize =
    Number(tenant.databaseOptions?.poolSize) ||
    Number.parseInt(process.env.TENANT_DB_POOL_SIZE || String(DEFAULT_POOL_SIZE), 10);

  return {
    ...dialect.connectionOptions(tenantConnectionSettings(tenant), poolSize),
    entities: [...TENANT_ENTITIES, ...extraEntities],
    migrations: TENANT_MIGRATIONS,
    migrationsTableName: TENANT_MIGRATIONS_TABLE,
    // The schema only changes through SchemaManager (provisioning and migrations).
    synchronize: false,
    logging: false,
  } as DataSourceOptions;
}

/** Changes whenever the tenant's connection details change, so a stale pool is replaced. */
export function tenantConnectionFingerprint(tenant: Tenant): string {
  return createHash('sha256')
    .update(
      [
        tenant.databaseType,
        tenant.databaseHost,
        tenant.databasePort,
        tenant.databaseName,
        tenant.databaseUsername,
        tenant.databasePassword,
        JSON.stringify(tenant.databaseOptions ?? {}),
      ].join('|'),
    )
    .digest('hex');
}
