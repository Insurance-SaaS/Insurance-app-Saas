import { Controller, Get } from '@nestjs/common';
import { TenantContextService } from './tenant.context';
import { PluginRegistryService } from 'src/core/plugin-registry/plugin-registry.service';
import { Public } from 'src/auth/decorators/public.decorator';
import { NoTenant } from './decorators/no-tenant.decorator';

@Public()
@NoTenant()
@Controller('tenant')
export class TenantPublicController {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly pluginRegistryService: PluginRegistryService,
  ) {}

  @Get('config')
  async getTenantConfig(): Promise<Record<string, unknown>> {
    const tenant = this.tenantContext.getTenant();
    if (!tenant) {
      return {
        name: 'Insurance Platform',
        branding: {},
        enabledComponents: [],
        supportedLanguages: ['en', 'fr', 'ar'],
        defaultLanguage: 'en',
        customFields: {},
      };
    }

    const config = tenant.config ?? {};
    const enabledComponents = await this.pluginRegistryService.getEnabledPlugins(tenant.id);

    return {
      name: tenant.name,
      branding: (config as any).branding ?? {},
      enabledComponents,
      supportedLanguages: (config as any).supportedLanguages ?? ['en', 'fr', 'ar'],
      defaultLanguage: (config as any).defaultLanguage ?? 'en',
      customFields: (config as any).customFields ?? {},
    };
  }
}
