// ─── @insurance/ Plugin Registry ──────────────────────────────────────
export { PluginRegistryModule } from './plugin-registry.module';
export { PluginRegistryService } from './plugin-registry.service';
export { TenantPlugin } from './entities/tenant-plugin.entity';
export { PluginGuard } from './guards/plugin.guard';
export { RequiresPlugin, PLUGIN_NAME_METADATA } from './decorators/requires-plugin.decorator';
export { PluginResolutionMiddleware } from './plugin-resolution.middleware';
