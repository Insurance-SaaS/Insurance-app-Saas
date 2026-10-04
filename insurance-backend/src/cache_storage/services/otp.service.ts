import { Injectable, Logger } from '@nestjs/common';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { RedisService } from './redis.service';
import { IOtpService, OtpPurpose } from 'src/contracts/interfaces/i-otp.service';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { buildTenantCacheKey } from 'src/shared/utils/cache-key.util';

/**
 * OTP lifecycle service implementing IOtpService.
 *
 * Centralises the generate → store → verify → invalidate flow.
 * Delivery (email/SMS) is NOT handled here — callers send the code
 * themselves via EmailService/SmsService after calling generate().
 *
 * This keeps OtpService free from delivery-channel dependencies
 * while still owning the code storage and verification logic.
 */
@Injectable()
export class OtpService implements IOtpService {
  private readonly logger = new Logger(OtpService.name);
  private static readonly DEFAULT_TTL = 900; // 15 minutes
  /** Wrong guesses allowed before the code is thrown away. */
  private static readonly MAX_ATTEMPTS = 5;

  constructor(
    private readonly redis: RedisService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private getTenantSlug(): string {
    return this.tenantContext.requireTenant().slug;
  }

  private buildKey(purpose: OtpPurpose, identifier: string): string {
    return buildTenantCacheKey(this.getTenantSlug(), 'otp', purpose, identifier);
  }

  private buildAttemptsKey(purpose: OtpPurpose, identifier: string): string {
    return buildTenantCacheKey(this.getTenantSlug(), 'otp-attempts', purpose, identifier);
  }

  /**
   * Generate a 6-digit OTP code and store it in Redis.
   *
   * NOTE: This method does NOT deliver the OTP. The caller is responsible
   * for sending the code via the appropriate channel (email/SMS).
   * The generated code is returned so the caller can deliver it.
   */
  async generate(
    purpose: OtpPurpose,
    identifier: string,
    _channel: 'email' | 'sms',
    options?: { ttlSeconds?: number },
  ): Promise<string> {
    const code = String(randomInt(100000, 1000000));
    const ttl = options?.ttlSeconds ?? OtpService.DEFAULT_TTL;

    await this.redis.set(this.buildKey(purpose, identifier), JSON.stringify(code), ttl);
    await this.redis.del(this.buildAttemptsKey(purpose, identifier));

    this.logger.debug(`OTP generated for [${purpose}] (ttl=${ttl}s)`);

    return code;
  }

  async verify(
    purpose: OtpPurpose,
    identifier: string,
    code: string,
    options?: { consume?: boolean },
  ): Promise<boolean> {
    const stored = await this.redis.get(this.buildKey(purpose, identifier));
    if (!stored) return false;

    // Stored value is JSON-stringified
    const expected = Buffer.from(String(JSON.parse(stored)));
    const received = Buffer.from(String(code));
    const matches = expected.length === received.length && timingSafeEqual(expected, received);

    if (!matches) {
      // A 6-digit code is guessable; stop after a few wrong attempts.
      const attemptsKey = this.buildAttemptsKey(purpose, identifier);
      const attempts = await this.redis.incr(attemptsKey);
      if (attempts === 1) {
        await this.redis.expire(attemptsKey, OtpService.DEFAULT_TTL);
      }
      if (attempts >= OtpService.MAX_ATTEMPTS) {
        await this.invalidate(purpose, identifier);
        this.logger.warn(`OTP invalidated after ${attempts} wrong attempts [${purpose}]`);
      }
      return false;
    }

    if (options?.consume !== false) {
      await this.invalidate(purpose, identifier);
    }
    return true;
  }

  async invalidate(purpose: OtpPurpose, identifier: string): Promise<void> {
    await this.redis.del(this.buildKey(purpose, identifier));
    await this.redis.del(this.buildAttemptsKey(purpose, identifier));
  }
}
