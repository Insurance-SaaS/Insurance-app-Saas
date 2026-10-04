import { Injectable, Logger } from '@nestjs/common';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PluginManifest } from 'src/contracts/types/plugin-manifest';

/**
 * Shape that an external @insurance/* npm package must export
 * under the `PLUGIN_ENTRY` key.
 */
export interface ExternalPluginEntry {
  manifest: PluginManifest;
  module: any; // NestJS Module or DynamicModule
  entities?: Function[];
}

const PLUGIN_ENTRY_KEY = 'PLUGIN_ENTRY';
const NAMESPACE_DIR = '@insurance-app-saas';

/**
 * PluginLoaderService
 *
 * Scans `node_modules/@insurance-app-saas/*` at boot time for npm packages
 * that export a `PLUGIN_ENTRY` constant satisfying ExternalPluginEntry.
 *
 * The discovered modules are imported dynamically into the NestJS app
 * and their manifests are registered with the PluginRegistryService.
 */
@Injectable()
export class PluginLoaderService {
  private readonly logger = new Logger(PluginLoaderService.name);
  private readonly discovered: ExternalPluginEntry[] = [];

  /**
   * Scan `node_modules/@insurance-app-saas/` for plugin packages.
   * Call this during application bootstrap, before NestFactory.create().
   *
   * @param nodeModulesPath  Absolute path to node_modules (default: auto-detect)
   * @param skipPackages     Package short names to ignore (e.g. ['plugin-sdk'])
   */
  discoverPlugins(
    nodeModulesPath?: string,
    skipPackages: string[] = ['plugin-sdk'],
  ): ExternalPluginEntry[] {
    const nmPath = nodeModulesPath || this.findNodeModules();
    const nsDir = join(nmPath, NAMESPACE_DIR);

    if (!existsSync(nsDir)) {
      this.logger.log(`No ${NAMESPACE_DIR} directory in node_modules — 0 external plugins`);
      return [];
    }

    const entries = readdirSync(nsDir, { withFileTypes: true });
    const skipSet = new Set(skipPackages);

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (skipSet.has(entry.name)) continue;

      const pkgPath = join(nsDir, entry.name);
      try {
        const pluginEntry = this.tryLoadPlugin(pkgPath, entry.name);
        if (pluginEntry) {
          this.discovered.push(pluginEntry);
          this.logger.log(
            `Discovered external plugin: ${pluginEntry.manifest.id} v${pluginEntry.manifest.version}`,
          );
        }
      } catch (err: any) {
        this.logger.warn(`Failed to load @insurance-app-saas/${entry.name}: ${err.message}`);
      }
    }

    this.logger.log(`External plugin scan complete: ${this.discovered.length} plugin(s) found`);
    return [...this.discovered];
  }

  /** Get all plugins that were discovered in the last scan */
  getDiscoveredPlugins(): ExternalPluginEntry[] {
    return [...this.discovered];
  }

  /** Get just the NestJS modules to import */
  getModules(): any[] {
    return this.discovered.map((p) => p.module);
  }

  /** Get just the entity classes to register with tenant DataSources */
  getEntities(): Function[] {
    return this.discovered.flatMap((p) => p.entities || []);
  }

  /** Get just the manifests */
  getManifests(): PluginManifest[] {
    return this.discovered.map((p) => p.manifest);
  }

  // ── Private helpers ──────────────────────────────────────────────

  private tryLoadPlugin(pkgPath: string, shortName: string): ExternalPluginEntry | null {
    // 1. Check if package.json exists and has a valid main/types
    const pkgJsonPath = join(pkgPath, 'package.json');
    if (!existsSync(pkgJsonPath)) {
      return null;
    }

    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));

    // 2. Check for the @insurance-app-saas/plugin-sdk marker in dependencies/peerDependencies
    const allDeps = {
      ...pkgJson.dependencies,
      ...pkgJson.peerDependencies,
    };
    const hasSDK = '@insurance-app-saas/plugin-sdk' in (allDeps || {});
    const hasInsuranceKeyword = (pkgJson.keywords || []).includes('insurance-plugin');

    if (!hasSDK && !hasInsuranceKeyword) {
      // Not a plugin — could be the SDK itself or an unrelated package
      return null;
    }

    // 3. Require the package and look for PLUGIN_ENTRY
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const exported = require(pkgPath);

    if (!exported[PLUGIN_ENTRY_KEY]) {
      this.logger.warn(
        `@insurance-app-saas/${shortName} has plugin-sdk dep but no ${PLUGIN_ENTRY_KEY} export — skipping`,
      );
      return null;
    }

    const pluginEntry: ExternalPluginEntry = exported[PLUGIN_ENTRY_KEY];

    // 4. Validate the entry shape
    if (!pluginEntry.manifest || !pluginEntry.module) {
      this.logger.warn(
        `@insurance-app-saas/${shortName}: ${PLUGIN_ENTRY_KEY} is missing 'manifest' or 'module' — skipping`,
      );
      return null;
    }

    if (!pluginEntry.manifest.id || !pluginEntry.manifest.version) {
      this.logger.warn(
        `@insurance-app-saas/${shortName}: manifest is missing 'id' or 'version' — skipping`,
      );
      return null;
    }

    return pluginEntry;
  }

  private findNodeModules(): string {
    // Walk up from the running process to find node_modules
    let dir = process.cwd();
    for (let i = 0; i < 10; i++) {
      const nmPath = join(dir, 'node_modules');
      if (existsSync(nmPath)) {
        return nmPath;
      }
      const parent = join(dir, '..');
      if (parent === dir) break;
      dir = parent;
    }
    return join(process.cwd(), 'node_modules');
  }
}
