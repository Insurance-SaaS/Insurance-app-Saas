import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PluginRegistryService } from 'src/core/plugin-registry/plugin-registry.service';
import { TenantMigrationRunner } from 'src/core/database/tenant-migration.runner';
import { PlatformAdminGuard } from 'src/core/platform-admin/platform-admin.guard';
import { AuditAction } from 'src/shared/decorators/audit-action.decorator';
import { AuditLogInterceptor } from 'src/shared/interceptors/audit-log.interceptor';
import { CreateTenantDto } from './dtos/create-tenant.dto';
import { OnboardTenantDto } from './dtos/onboard-tenant.dto';
import { UpdateTenantComponentsDto } from './dtos/tenant-components.dto';
import { UpdateTenantDto } from './dtos/update-tenant.dto';
import { RevertMigrationsDto } from './dtos/revert-migrations.dto';
import { TenantOnboardingService } from './tenant-onboarding.service';
import { TenantService } from './tenant.service';
import { PlatformAuth } from 'src/auth/decorators/platform-auth.decorator';

@Controller('platform/tenants')
@PlatformAuth()
@UseGuards(PlatformAdminGuard)
@UseInterceptors(AuditLogInterceptor)
export class PlatformTenantsController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly tenantOnboardingService: TenantOnboardingService,
    private readonly pluginRegistryService: PluginRegistryService,
    private readonly tenantMigrationRunner: TenantMigrationRunner,
  ) {}

  @Get()
  async getTenants() {
    return this.tenantService.findAll();
  }

  @Get(':tenantId')
  async getTenantById(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    const tenant = await this.tenantService.findById(tenantId);
    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }
    return tenant;
  }

  @Post()
  @AuditAction('tenant.create', 'tenant')
  async createTenant(@Body() body: CreateTenantDto) {
    const existing = await this.tenantService.findBySlug(body.slug.trim().toLowerCase());
    if (existing) {
      throw new BadRequestException(`Tenant slug "${body.slug}" already exists`);
    }

    const tenant = await this.tenantService.create({
      ...body,
      slug: body.slug.trim().toLowerCase(),
      isActive: body.isActive ?? true,
    });
    // A tenant always has an explicit row per plugin; a new one starts with all enabled.
    await this.pluginRegistryService.setTenantPlugins(tenant.id, [], { seedAll: true });
    return tenant;
  }

  @Patch(':tenantId')
  @AuditAction('tenant.update', 'tenant')
  async updateTenant(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() body: UpdateTenantDto,
  ) {
    const updated = await this.tenantService.update(tenantId, body);
    if (!updated) {
      throw new BadRequestException('Tenant not found');
    }
    return updated;
  }

  @Get(':tenantId/components')
  async getTenantComponents(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.pluginRegistryService.getTenantPlugins(tenantId);
  }

  @Put(':tenantId/components')
  @AuditAction('tenant.components.update', 'plugin')
  async updateTenantComponents(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() body: UpdateTenantComponentsDto,
  ) {
    const tenant = await this.tenantService.findById(tenantId);
    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    // Checked as a whole: a plugin cannot stay enabled without its dependencies.
    await this.pluginRegistryService.setTenantPlugins(tenantId, body.components);
    return this.pluginRegistryService.getTenantPlugins(tenantId);
  }

  @Post('onboard')
  @AuditAction('tenant.onboard', 'tenant')
  async onboardTenant(@Body() body: OnboardTenantDto) {
    return this.tenantOnboardingService.onboard(body);
  }

  @Post(':tenantSlug/migrations/run')
  @AuditAction('migration.run', 'migration')
  async runMigrationsForTenant(@Param('tenantSlug') tenantSlug: string) {
    return this.tenantMigrationRunner.runForTenant(tenantSlug);
  }

  @Post('migrations/run-all')
  @AuditAction('migration.run-all', 'migration')
  async runMigrationsForAllTenants() {
    return this.tenantMigrationRunner.runForAllActiveTenants();
  }

  /** Schema version of a tenant database and what it is missing, without changing it. */
  @Get(':tenantSlug/schema')
  async getTenantSchemaStatus(@Param('tenantSlug') tenantSlug: string) {
    return this.tenantMigrationRunner.status(tenantSlug);
  }

  /**
   * Reverts a tenant's migrations until `toVersion` is the newest one applied.
   * A named target is used because "the last migration" differs between tenants.
   */
  @Post(':tenantSlug/migrations/revert')
  @AuditAction('migration.revert', 'migration')
  async revertMigrationsForTenant(
    @Param('tenantSlug') tenantSlug: string,
    @Body() body: RevertMigrationsDto,
  ) {
    return this.tenantMigrationRunner.revertTenantTo(tenantSlug, body.toVersion);
  }
}
