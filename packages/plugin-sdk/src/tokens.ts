/**
 * @insurance-app-saas/plugin-sdk — Injection Tokens
 *
 * These symbols are shared between the platform core and external plugins.
 * Plugins use these tokens to inject platform services without
 * depending on concrete implementations.
 */

// ─── Infrastructure Services ────────────────────────────────────────
export const CACHE_SERVICE = Symbol.for("ICacheService");
export const STORAGE_SERVICE = Symbol.for("IStorageService");
export const OTP_SERVICE = Symbol.for("IOtpService");

// ─── Domain Services ────────────────────────────────────────────────
export const CLAIMS_SERVICE = Symbol.for("IClaimsService");
export const QUOTES_SERVICE = Symbol.for("IQuotesService");
export const USERS_SERVICE = Symbol.for("IUsersService");
export const NOTIFICATION_SERVICE = Symbol.for("INotificationService");
export const AUTH_SERVICE = Symbol.for("IAuthService");

// ─── Plugin Infrastructure ──────────────────────────────────────────
export const PLUGIN_REGISTRY = Symbol.for("IPluginRegistryService");

// ─── Integration Services ───────────────────────────────────────────
export const ERP_SERVICE = Symbol.for("IErpService");
export const SMS_PROVIDER = Symbol.for("ISmsProvider");
export const EMAIL_PROVIDER = Symbol.for("IEmailProvider");
export const STORAGE_PROVIDER = Symbol.for("IStorageProvider");
