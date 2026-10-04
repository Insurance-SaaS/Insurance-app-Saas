import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { PLUGIN_NAME_METADATA } from '../decorators/requires-plugin.decorator';
import { PluginRegistryService } from '../plugin-registry.service';
import { pluginId as normalizePluginId } from 'src/contracts/types/plugin-manifest';

@Injectable()
export class PluginGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContextService,
    private readonly pluginRegistry: PluginRegistryService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const pluginId = this.reflector.getAllAndOverride<string>(PLUGIN_NAME_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!pluginId) {
      return true;
    }

    const tenant = this.tenantContext.getTenant();

    // Plugin state is per tenant; without a tenant nothing is enabled.
    if (!tenant) {
      throw new ForbiddenException(`Plugin '${pluginId}' requires a tenant`);
    }

    const normalized = normalizePluginId(pluginId);

    // Fast path: use pre-resolved plugins from PluginResolutionMiddleware (O(1) Set lookup).
    const preResolved = this.tenantContext.getEnabledPlugins();
    if (preResolved) {
      const enabled = preResolved.has(normalized);
      if (!enabled) {
        throw new ForbiddenException(`Plugin '${pluginId}' is disabled for this tenant`);
      }
      return true;
    }

    // No pre-resolved set (e.g. the middleware failed): ask the registry, same rule.
    const enabled = await this.pluginRegistry.isPluginEnabled(tenant.id, pluginId);
    if (!enabled) {
      throw new ForbiddenException(`Plugin '${pluginId}' is disabled for this tenant`);
    }

    return true;
  }
}
