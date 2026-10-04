import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { TenantContextService } from '../tenant/tenant.context';
import { PluginRegistryService } from './plugin-registry.service';

/**
 * Middleware that pre-resolves the enabled plugins for the current tenant
 * and stores them in TenantContextService.
 *
 * Must run AFTER TenantMiddleware + TenantDataSourceMiddleware so that
 * the tenant is already available in the AsyncLocalStorage context.
 *
 * This eliminates per-request DB queries in PluginGuard — the guard
 * can now do an O(1) Set lookup instead.
 */
@Injectable()
export class PluginResolutionMiddleware implements NestMiddleware {
  private readonly logger = new Logger(PluginResolutionMiddleware.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly pluginRegistry: PluginRegistryService,
  ) {}

  async use(req: any, res: any, next: (err?: Error) => void): Promise<void> {
    const tenant = this.tenantContext.getTenant();

    if (!tenant) {
      // No tenant → nothing to resolve (public or health routes).
      next();
      return;
    }

    try {
      const enabledPlugins = await this.pluginRegistry.getEnabledPlugins(tenant.id);
      this.tenantContext.setEnabledPlugins(enabledPlugins);
    } catch (error) {
      this.logger.error(
        `Failed to resolve plugins for tenant "${tenant.id}"`,
        error instanceof Error ? error.stack : String(error),
      );
      // Don't block the request — PluginGuard will fall back to DB if needed.
    }

    next();
  }
}
