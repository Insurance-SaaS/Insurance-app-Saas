// cache_storage/services/redis.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);
  private lastErrorLoggedAt = 0;

  constructor(private readonly configService: ConfigService) {
    const cacheConfig = this.configService.get('cache');
    this.client = new Redis({
      host: cacheConfig.redis.host,
      port: cacheConfig.redis.port,
      password: cacheConfig.redis.password,
      db: cacheConfig.redis.db,
      ...(cacheConfig.redis.tls ? { tls: {} } : {}),
    });
    // Without a listener ioredis prints every failed reconnection attempt itself.
    this.client.on('error', (error: Error) => {
      if (Date.now() - this.lastErrorLoggedAt > 30_000) {
        this.lastErrorLoggedAt = Date.now();
        this.logger.error(`Redis is unreachable: ${error.message}`);
      }
    });
  }

  getClient(): Redis {
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string) {
    return this.client.del(key);
  }

  /** Atomically increments a counter and returns the new value. */
  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }
}
