import { TENANT_MIGRATIONS } from 'src/database/migrations';

/** Oldest first, as the application registers them. */
export const TENANT_MIGRATION_CLASSES = TENANT_MIGRATIONS;

const names = TENANT_MIGRATIONS.map((Migration) => new Migration().name);

/** The version every new tenant database starts from. */
export const TENANT_BASELINE = names[0];

/** The version a tenant database is at once every migration has run. */
export const LATEST_TENANT_MIGRATION = names[names.length - 1];
