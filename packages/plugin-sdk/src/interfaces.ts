/**
 * ICacheService — Generic tenant-scoped caching interface.
 */
export interface ICacheService {
  get<T>(entityType: string, key: string): Promise<T | null>;
  set<T>(
    entityType: string,
    key: string,
    value: T,
    ttl?: number,
  ): Promise<void>;
  invalidate(entityType: string, ...keys: string[]): Promise<void>;
  invalidateAll(entityType: string): Promise<void>;
}

/**
 * IStorageService — Framework-agnostic object storage interface.
 */
export interface IStorageService {
  upload(
    bucket: string,
    key: string,
    file: Buffer,
    contentType?: string,
  ): Promise<string>;
  delete(fileUrl: string): Promise<void>;
  getSignedUrl(fileUrl: string, expirySeconds?: number): Promise<string | null>;
  invalidateSignedUrlCache(fileUrl: string): Promise<void>;
}

/**
 * IOtpService — One-Time Password lifecycle management.
 */
export type OtpPurpose =
  | "signup-email"
  | "signup-sms"
  | "password-reset"
  | "delete-account"
  | string;
export type OtpChannel = "email" | "sms";

export interface IOtpService {
  generate(
    purpose: OtpPurpose,
    identifier: string,
    channel: OtpChannel,
    options?: { ttlSeconds?: number },
  ): Promise<string>;
  verify(
    purpose: OtpPurpose,
    identifier: string,
    code: string,
  ): Promise<boolean>;
  invalidate(purpose: OtpPurpose, identifier: string): Promise<void>;
}

/**
 * IClaimsService — Claims domain interface.
 */
export interface IClaimsService {
  declareSinister(formData: any, files: any[], userId: string): Promise<any>;
  findById(id: string): Promise<any>;
  findByNumDossier(numDossier: string): Promise<any>;
  findByUserId(userId: string): Promise<any[]>;
  updateStatus(id: string, status: string): Promise<any>;
  getReclamationStatus(identifier: string, userId: string): Promise<any>;
}

/**
 * IQuotesService — Quotes domain interface.
 */
export interface IQuotesService {
  findById(id: string): Promise<any>;
  getAllDevis(): Promise<any[]>;
  getAllDevisByProductType(productType: string): Promise<any[]>;
  getAllProducts(): Promise<any[]>;
  getRecommmendedDevis(filters: any, language?: string): Promise<any>;
  getDetailsDevis(id: string, language?: string): Promise<any>;
  compareDevis(
    devisAId: string,
    devisBId: string,
    language?: string,
  ): Promise<any>;
}

/**
 * IUsersService — Users domain interface.
 */
export interface IUsersService {
  findById(id: string): Promise<any>;
  findByEmail(email: string): Promise<any>;
  findByPhone(phone: string): Promise<any>;
  createUser(user: any, file?: any): Promise<any>;
  updateUser(id: string, updates: any): Promise<any>;
  deleteUser(id: string): Promise<any>;
}

/**
 * INotificationService — Push notification interface.
 */
export interface INotificationService {
  sendToUser(
    userId: string,
    notification: {
      title: string;
      body: string;
      data?: Record<string, string>;
    },
  ): Promise<void>;
  sendToTopic(
    topic: string,
    notification: {
      title: string;
      body: string;
      data?: Record<string, string>;
    },
  ): Promise<void>;
}

/**
 * IPluginRegistryService — Plugin Registry Contract.
 */
export interface IPluginRegistryService {
  registerPlugin(manifest: import("./plugin-manifest").PluginManifest): void;
  getRegisteredPlugins(): import("./plugin-manifest").PluginManifest[];
  getPluginManifest(
    pluginId: string,
  ): import("./plugin-manifest").PluginManifest | undefined;
  isPluginEnabled(tenantId: string, pluginId: string): Promise<boolean>;
  getEnabledPlugins(tenantId: string): Promise<string[]>;
  upsertPlugin(
    tenantId: string,
    pluginId: string,
    isEnabled: boolean,
    config?: Record<string, unknown>,
  ): Promise<any>;
}
