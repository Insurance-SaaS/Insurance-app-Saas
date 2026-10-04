import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Opts a route (or a whole controller) out of authentication.
 * Every route requires a valid token unless it carries this decorator.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
