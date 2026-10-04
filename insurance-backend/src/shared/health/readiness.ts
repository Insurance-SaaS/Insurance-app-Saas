import { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisService } from 'src/cache_storage/services/redis.service';
import { getDialect } from 'src/core/database/dialects';

export interface Readiness {
  status: 'ok' | 'unavailable';
  checks: Record<'database' | 'redis', 'ok' | 'failed'>;
}

const CHECK_TIMEOUT_MS = 3000;

/** Fails instead of waiting forever: a dependency that hangs is not ready. */
function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), CHECK_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Whether this instance can serve requests: the platform database and Redis
 * both answer. Tenant databases are not part of it; one tenant's database
 * being down must not take the instance out of rotation for everyone else.
 */
export async function checkReadiness(app: INestApplicationContext): Promise<Readiness> {
  const dataSource = app.get(DataSource);
  const redis = app.get(RedisService, { strict: false });

  const [database, cache] = await Promise.allSettled([
    withTimeout(dataSource.query(getDialect(dataSource.options.type).pingQuery)),
    withTimeout(redis.getClient().ping()),
  ]);

  const checks = {
    database: database.status === 'fulfilled' ? 'ok' : 'failed',
    redis: cache.status === 'fulfilled' ? 'ok' : 'failed',
  } as const;
  return {
    status: Object.values(checks).every((check) => check === 'ok') ? 'ok' : 'unavailable',
    checks,
  };
}
