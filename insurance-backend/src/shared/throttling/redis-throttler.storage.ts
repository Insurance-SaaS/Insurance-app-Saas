import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from 'src/cache_storage/services/redis.service';

interface ThrottlerRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Counts one hit and answers in a single round trip, so two instances can
 * never both let the "last allowed" request through.
 *
 * KEYS[1] hit counter, KEYS[2] block marker
 * ARGV[1] window (ms), ARGV[2] limit, ARGV[3] block duration (ms)
 * Returns { hits, ms until the window ends, blocked (0/1), ms until the block ends }
 */
const HIT_SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  return { tonumber(ARGV[2]) + 1, blockTtl, 1, blockTtl }
end

local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end

if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  redis.call('DEL', KEYS[1])
  return { hits, ttl, 1, tonumber(ARGV[3]) }
end
return { hits, ttl, 0, 0 }
`;

/**
 * Rate-limit counters in Redis instead of the memory of one process, so the
 * limits hold however many instances serve the API, and survive a restart.
 *
 * If Redis cannot be reached the request is let through and the failure is
 * logged: an outage of the counter store should not take the whole API down.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private lastFailureLoggedAt = 0;

  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerRecord> {
    const base = `throttle:${throttlerName}:${key}`;
    let result: number[];
    try {
      result = (await this.redis
        .getClient()
        .eval(
          HIT_SCRIPT,
          2,
          `${base}:hits`,
          `${base}:blocked`,
          ttl,
          limit,
          blockDuration || ttl,
        )) as number[];
    } catch (error) {
      if (Date.now() - this.lastFailureLoggedAt > 60_000) {
        this.lastFailureLoggedAt = Date.now();
        this.logger.error(`Rate limiting is not being applied: ${(error as Error).message}`);
      }
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }

    const [totalHits, timeToExpire, blocked, timeToBlockExpire] = result;
    return {
      totalHits,
      // Redis answers in milliseconds; the guard writes these into headers as seconds.
      timeToExpire: Math.ceil(timeToExpire / 1000),
      isBlocked: blocked === 1,
      timeToBlockExpire: Math.ceil(timeToBlockExpire / 1000),
    };
  }
}
