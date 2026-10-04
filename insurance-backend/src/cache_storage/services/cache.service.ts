import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';
import { ICacheService } from 'src/contracts/interfaces/i-cache.service';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { buildTenantCacheKey } from 'src/shared/utils/cache-key.util';

/**
 * Tenant-scoped caching service.
 *
 * Replaces the pattern of every service manually calling
 *   buildTenantCacheKey() + redisService.get/set/del
 * scattered across Claims, Users, Quotes, ERP, and CustomFields.
 */
@Injectable()
export class CacheService implements ICacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private getTenantSlug(): string {
    return this.tenantContext.requireTenant().slug;
  }

  private buildKey(entityType: string, key: string): string {
    return buildTenantCacheKey(this.getTenantSlug(), entityType, key);
  }

  async get<T>(entityType: string, key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(this.buildKey(entityType, key));
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn(`Cache read failed [${entityType}:${key}]: ${String(error)}`);
      return null;
    }
  }

  async set<T>(entityType: string, key: string, value: T, ttl?: number): Promise<void> {
    try {
      const effectiveTtl = ttl ?? this.getDefaultTtl(entityType);
      await this.redis.set(this.buildKey(entityType, key), JSON.stringify(value), effectiveTtl);
    } catch (error) {
      this.logger.warn(`Cache write failed [${entityType}:${key}]: ${String(error)}`);
    }
  }

  async invalidate(entityType: string, ...keys: string[]): Promise<void> {
    try {
      await Promise.all(keys.map((k) => this.redis.del(this.buildKey(entityType, k))));
    } catch (error) {
      this.logger.warn(`Cache invalidation failed [${entityType}]: ${String(error)}`);
    }
  }

  async invalidateAll(entityType: string): Promise<void> {
    try {
      await this.redis.del(this.buildKey(entityType, 'all'));
    } catch (error) {
      this.logger.warn(`Cache invalidateAll failed [${entityType}]: ${String(error)}`);
    }
  }

  /** Resolve default TTL from cache config, falling back to 300s. */
  private getDefaultTtl(entityType: string): number {
    try {
      const cacheConfig = this.configService.get('cache');
      return cacheConfig?.ttl?.[entityType] ?? 300;
    } catch {
      return 300;
    }
  }
}
