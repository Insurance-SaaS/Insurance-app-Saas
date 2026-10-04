import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantService } from './tenant.service';
import { TenantContextService } from './tenant.context';
import { TenantMiddleware } from './tenant.middleware';
import { TenantPublicController } from './tenant-public.controller';
import { PlatformTenantsController } from './platform-tenants.controller';
import { TenantOnboardingService } from './tenant-onboarding.service';
import { TenantContextRunner } from './tenant-context.runner';
import { DatabaseCoreModule } from '../database/database-core.module';
import { PluginRegistryModule } from '../plugin-registry/plugin-registry.module';
import { PlatformAdminModule } from '../platform-admin/platform-admin.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant]),
    DatabaseCoreModule,
    PluginRegistryModule,
    PlatformAdminModule,
  ],
  controllers: [TenantPublicController, PlatformTenantsController],
  providers: [
    TenantService,
    TenantContextService,
    TenantContextRunner,
    TenantMiddleware,
    TenantOnboardingService,
  ],
  exports: [
    TenantService,
    TenantContextService,
    TenantContextRunner,
    TenantMiddleware,
    TenantOnboardingService,
  ],
})
export class TenantModule {}
