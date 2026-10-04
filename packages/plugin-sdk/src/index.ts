/**
 * @insurance-app-saas/plugin-sdk
 *
 * The official SDK for building external plugins for the
 * @insurance platform. Install this as a dependency in your
 * plugin package to get access to all the types, tokens,
 * interfaces, and decorators you need.
 *
 * Usage:
 *   npm install @insurance-app-saas/plugin-sdk
 *
 *   import {
 *     InsurancePlugin, PLUGIN_ENTRY_KEY,
 *     PluginManifest, pluginId,
 *     CACHE_SERVICE, USERS_SERVICE,
 *     RequiresPlugin,
 *   } from '@insurance-app-saas/plugin-sdk';
 */

// Plugin contract
export { InsurancePlugin, PLUGIN_ENTRY_KEY } from "./plugin-interface";

// Manifest
export { PluginManifest, pluginId, PLUGIN_NAMESPACE } from "./plugin-manifest";

// Injection tokens
export {
  CACHE_SERVICE,
  STORAGE_SERVICE,
  OTP_SERVICE,
  CLAIMS_SERVICE,
  QUOTES_SERVICE,
  USERS_SERVICE,
  NOTIFICATION_SERVICE,
  AUTH_SERVICE,
  PLUGIN_REGISTRY,
  ERP_SERVICE,
  SMS_PROVIDER,
  EMAIL_PROVIDER,
  STORAGE_PROVIDER,
} from "./tokens";

// Service interfaces
export {
  ICacheService,
  IStorageService,
  IOtpService,
  IClaimsService,
  IQuotesService,
  IUsersService,
  INotificationService,
  IPluginRegistryService,
  OtpPurpose,
  OtpChannel,
} from "./interfaces";

// Decorators
export { RequiresPlugin } from "./decorators";
