import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ClaimsModule } from './modules/claims/claims.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { AiModule } from './modules/ai/ai.module';
import { ErpModule } from './integrations/erp/erp.module';
import { PaymentModule } from './modules/payment/payment.module';
import { LoggingModule } from './modules/logging/logging.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { UsersModule } from './modules/users/users.module';
import { CacheStorageModule } from './cache_storage/cache_storage.module';
import cacheConfig from './cache_storage/config/cache.config';
import { CommonModule } from './shared/common.module';
import { TranslationModule } from './translation/translation.module';
import { createDatabaseConfig, createPlatformDataSource } from './config/database.config';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { BranchesModule } from './modules/branches/branches.module';
import { TenantModule } from './core/tenant/tenant.module';
import { PluginRegistryModule } from './core/plugin-registry/plugin-registry.module';
import { DatabaseCoreModule } from './core/database/database-core.module';
import { TenantMiddleware } from './core/tenant/tenant.middleware';
import { TenantDataSourceMiddleware } from './core/database/tenant-datasource.middleware';
import { PluginResolutionMiddleware } from './core/plugin-registry/plugin-resolution.middleware';
import { CustomFieldsModule } from './core/custom-fields/custom-fields.module';
import { PlatformAdminModule } from './core/platform-admin/platform-admin.module';
import { AuditModule } from './shared/audit.module';
import { validateEnv } from './config/env.validation';
import { RedisService } from './cache_storage/services/redis.service';
import { RedisThrottlerStorage } from './shared/throttling/redis-throttler.storage';

@Module({
  imports: [
    // Configuration module
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [cacheConfig],
      // Stops the process at boot, listing everything that is missing or malformed.
      validate: validateEnv,
    }),
    // Rate limiting, counted in Redis so the limits hold across instances.
    ThrottlerModule.forRootAsync({
      imports: [CacheStorageModule],
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        throttlers: [
          { name: 'short', ttl: 1000, limit: 5 }, // 5 requests per second
          { name: 'medium', ttl: 60000, limit: 60 }, // 60 requests per minute
        ],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    // Event bus for cross-module communication
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
    }),
    // Database configuration - supports multiple database types
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: createDatabaseConfig,
      dataSourceFactory: (options) => createPlatformDataSource(options!),
      inject: [ConfigService],
    }),
    // Your feature modules
    AuthModule,
    ClaimsModule,
    QuotesModule,
    AiModule,
    ErpModule,
    PaymentModule,
    LoggingModule,
    UsersModule,
    CacheStorageModule,
    CommonModule,
    TranslationModule,
    NotificationsModule,
    BranchesModule,
    TenantModule,
    PluginRegistryModule,
    DatabaseCoreModule,
    CustomFieldsModule,
    PlatformAdminModule,
    AuditModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Registered as a provider and aliased so integration tests can override it.
    ThrottlerGuard,
    { provide: APP_GUARD, useExisting: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware, TenantDataSourceMiddleware, PluginResolutionMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.GET },
        { path: 'health/ready', method: RequestMethod.GET },
      )
      .forRoutes('*');
  }
}
