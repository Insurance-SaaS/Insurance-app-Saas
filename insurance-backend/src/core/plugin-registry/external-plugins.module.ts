import { DynamicModule, Logger, Module } from '@nestjs/common';
import { PluginLoaderService } from './plugin-loader.service';

/**
 * PARKED: this module is not imported by AppModule. Loading plugins from npm
 * packages is on hold until a real external plugin exists; see
 * packages/plugin-sdk/PLUGIN_AUTHORING_GUIDE.md for what must be finished first.
 *
 * ExternalPluginsModule
 *
 * A dynamic NestJS module that scans node_modules/@cw-insurance-saas/*
 * for external plugin packages and imports their modules.
 *
 * Usage in main.ts or AppModule:
 *
 *   ExternalPluginsModule.forRoot()         // auto-scan
 *   ExternalPluginsModule.forRoot({ skip: ['plugin-sdk'] })
 */
@Module({})
export class ExternalPluginsModule {
  private static readonly logger = new Logger('ExternalPluginsModule');

  static forRoot(options?: { nodeModulesPath?: string; skip?: string[] }): DynamicModule {
    const loader = new PluginLoaderService();
    const plugins = loader.discoverPlugins(
      options?.nodeModulesPath,
      options?.skip || ['plugin-sdk'],
    );

    if (plugins.length === 0) {
      this.logger.log('No external plugins found — module is a no-op');
      return {
        module: ExternalPluginsModule,
        imports: [],
      };
    }

    const modules = plugins.map((p) => p.module);
    const pluginNames = plugins.map((p) => p.manifest.id).join(', ');
    this.logger.log(`Loading ${plugins.length} external plugin(s): ${pluginNames}`);

    return {
      module: ExternalPluginsModule,
      imports: modules,
      providers: [
        {
          provide: 'EXTERNAL_PLUGIN_ENTRIES',
          useValue: plugins,
        },
        {
          provide: 'EXTERNAL_PLUGIN_ENTITIES',
          useValue: plugins.flatMap((p) => p.entities || []),
        },
      ],
      exports: ['EXTERNAL_PLUGIN_ENTRIES', 'EXTERNAL_PLUGIN_ENTITIES'],
    };
  }
}
