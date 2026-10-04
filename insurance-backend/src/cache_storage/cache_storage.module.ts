import { Module } from '@nestjs/common';

import { MinioService } from './services/minio.service';
import { RedisService } from './services/redis.service';
import { CacheService } from './services/cache.service';
import { StorageService } from './services/storage.service';
import { OtpService } from './services/otp.service';
import { CACHE_SERVICE, STORAGE_SERVICE, OTP_SERVICE } from 'src/contracts/tokens';

@Module({
  providers: [
    // Low-level infrastructure (still available for internal use)
    MinioService,
    RedisService,

    // High-level services behind interface tokens
    CacheService,
    { provide: CACHE_SERVICE, useExisting: CacheService },

    StorageService,
    { provide: STORAGE_SERVICE, useExisting: StorageService },

    OtpService,
    { provide: OTP_SERVICE, useExisting: OtpService },
  ],
  exports: [
    // Legacy exports (consumers still using concrete classes)
    MinioService,
    RedisService,

    // New token-based exports (preferred)
    CacheService,
    CACHE_SERVICE,
    StorageService,
    STORAGE_SERVICE,
    OtpService,
    OTP_SERVICE,
  ],
})
export class CacheStorageModule {}
