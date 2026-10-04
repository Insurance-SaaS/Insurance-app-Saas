import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantDataSourceManager } from 'src/core/database/tenant-datasource.manager';
import { PluginRegistryService } from 'src/core/plugin-registry/plugin-registry.service';
import { TenantContextService } from './tenant.context';
import { TenantService } from './tenant.service';

/**
 * Runs code as a given tenant outside an HTTP request: event listeners,
 * scheduled jobs, command-line tasks. Inside `work`, repositories, cache keys
 * and plugin checks resolve to that tenant exactly as they do in a request.
 */
@Injectable()
export class TenantContextRunner {
  constructor(
    private readonly tenantService: TenantService,
    private readonly tenantDataSourceManager: TenantDataSourceManager,
    private readonly pluginRegistry: PluginRegistryService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async run<T>(tenantSlug: string, work: () => Promise<T>): Promise<T> {
    const tenant = await this.tenantService.findBySlug(tenantSlug);
    if (!tenant?.isActive) {
      throw new NotFoundException(`Tenant "${tenantSlug}" not found or inactive`);
    }
    const dataSource = await this.tenantDataSourceManager.getDataSource(tenant);
    const enabledPlugins = new Set(await this.pluginRegistry.getEnabledPlugins(tenant.id));

    return this.tenantContext.runInContext({ tenant, dataSource, enabledPlugins }, work);
  }
}
