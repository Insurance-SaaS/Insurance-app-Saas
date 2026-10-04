import { SetMetadata } from '@nestjs/common';

export const NO_TENANT_KEY = 'tenant:notRequired';

/**
 * Marks a route (or controller) that does not operate on tenant data, so it may
 * be called without an X-Tenant-ID header. Everything else requires one.
 * Routes marked @PlatformAuth() are tenant-less implicitly.
 */
export const NoTenant = () => SetMetadata(NO_TENANT_KEY, true);
