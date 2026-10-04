/**
 * ICacheService — Generic tenant-scoped caching interface.
 *
 * Replaces the 75+ instances of manual buildCacheKey/redisService.get/set/del
 * scattered across Claims, Users, Quotes, ERP, and CustomFields services.
 */
export interface ICacheService {
  /**
   * Get a cached value by entity type and key.
   * Automatically scoped to the current tenant.
   */
  get<T>(entityType: string, key: string): Promise<T | null>;

  /**
   * Set a cached value with optional TTL (default: 300s).
   * Automatically scoped to the current tenant.
   */
  set<T>(entityType: string, key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Invalidate one or more cache keys for an entity type.
   */
  invalidate(entityType: string, ...keys: string[]): Promise<void>;

  /**
   * Invalidate the "all" cache key for an entity type.
   */
  invalidateAll(entityType: string): Promise<void>;
}
