import { SetMetadata } from '@nestjs/common';

export const IS_PLATFORM_ROUTE_KEY = 'auth:isPlatformRoute';

/**
 * Marks a route (or controller) as platform-level: it is authenticated with a
 * platform-admin token, signed with its own secret, instead of a tenant user token.
 */
export const PlatformAuth = () => SetMetadata(IS_PLATFORM_ROUTE_KEY, true);
