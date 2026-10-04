/**
 * A tenant slug as it is stored and as clients send it in X-Tenant-ID:
 * lower-case letters, digits, "-" and "_", starting with a letter or digit.
 */
export const TENANT_SLUG = /^[a-z0-9][a-z0-9_-]{0,62}$/;

/** What onboarding accepts; the slug is lower-cased before it is stored. */
export const TENANT_SLUG_INPUT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/;
