import { PlatformBaseline1759536000000 } from './platform/1759536000000-PlatformBaseline';
import { TenantBaseline1759536000000 } from './tenant/1759536000000-TenantBaseline';
import { ClaimDetailsAndIndexes1759622400000 } from './tenant/1759622400000-ClaimDetailsAndIndexes';

/**
 * Migrations are listed explicitly, oldest first, in two separate sets.
 * To change a schema: change the entity, add a migration class that uses
 * SchemaKit to bring existing databases to the new definition, and append it here.
 */
export const PLATFORM_MIGRATIONS = [PlatformBaseline1759536000000];

export const TENANT_MIGRATIONS = [TenantBaseline1759536000000, ClaimDetailsAndIndexes1759622400000];
