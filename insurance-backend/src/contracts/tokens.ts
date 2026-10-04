/**
 * Injection tokens for the services that modules use from each other.
 *
 * A module that needs another module's service injects the token and types it
 * with the matching interface in ./interfaces, instead of importing the class.
 * Only tokens that have a provider and at least one implementation are listed.
 */

// ─── Infrastructure services ────────────────────────────────────────
export const CACHE_SERVICE = Symbol.for('ICacheService');
export const STORAGE_SERVICE = Symbol.for('IStorageService');
export const OTP_SERVICE = Symbol.for('IOtpService');

// ─── Domain services ────────────────────────────────────────────────
export const CLAIMS_SERVICE = Symbol.for('IClaimsService');
export const QUOTES_SERVICE = Symbol.for('IQuotesService');
export const USERS_SERVICE = Symbol.for('IUsersService');

// ─── Plugin infrastructure ──────────────────────────────────────────
export const PLUGIN_REGISTRY = Symbol.for('IPluginRegistryService');
