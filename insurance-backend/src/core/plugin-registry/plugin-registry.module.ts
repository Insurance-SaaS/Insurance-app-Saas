import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantPlugin } from './entities/tenant-plugin.entity';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginLoaderService } from './plugin-loader.service';
import { PluginGuard } from './guards/plugin.guard';
import { PluginResolutionMiddleware } from './plugin-resolution.middleware';
import { PLUGIN_REGISTRY } from 'src/contracts/tokens';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([TenantPlugin])],
  providers: [
    PluginRegistryService,
    PluginLoaderService,
    { provide: PLUGIN_REGISTRY, useExisting: PluginRegistryService },
    PluginGuard,
    // Global: @RequiresPlugin() on a controller or handler is all a module needs.
    { provide: APP_GUARD, useExisting: PluginGuard },
    PluginResolutionMiddleware,
  ],
  exports: [
    PluginRegistryService,
    PluginLoaderService,
    PLUGIN_REGISTRY,
    PluginGuard,
    PluginResolutionMiddleware,
  ],
})
export class PluginRegistryModule {}
