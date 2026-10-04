/**
 * @insurance/plugin-sdk — InsurancePlugin Interface
 *
 * This is the main contract that every external plugin npm package
 * must satisfy. The platform's PluginLoaderService scans node_modules
 * for packages that export this interface.
 *
 * Convention:
 *   1. npm package name = @insurance/<plugin-name>
 *   2. The package's main export must include `PLUGIN_ENTRY`
 *   3. PLUGIN_ENTRY satisfies InsurancePlugin
 */

import type { DynamicModule, Type } from "@nestjs/common";
import type { PluginManifest } from "./plugin-manifest";

export interface InsurancePlugin {
  /** The manifest describing this plugin */
  manifest: PluginManifest;

  /**
   * The NestJS module class that contains all controllers, providers,
   * and exports for this plugin.
   *
   * Can be a static Module class or a DynamicModule factory
   * (useful for plugins that accept configuration).
   */
  module: Type<any> | DynamicModule;

  /**
   * Optional: entity classes that belong to tenant databases.
   * The platform will register them in the tenant DataSource
   * so TypeORM can create/sync tables automatically.
   */
  entities?: Function[];
}

/**
 * Well-known export name that the PluginLoaderService looks for
 * when scanning @insurance/* packages from node_modules.
 */
export const PLUGIN_ENTRY_KEY = "PLUGIN_ENTRY";
