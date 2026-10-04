import { PluginManifest } from '../types/plugin-manifest';

/**
 * @insurance/platform-core — Plugin Registry Contract
 *
 * Abstracts the per-tenant plugin resolution layer.
 * Consumers inject via the PLUGIN_REGISTRY token.
 */
export interface IPluginRegistryService {
  /** Register a plugin manifest (called at module init) */
  registerPlugin(manifest: PluginManifest): void;

  /** Get all registered manifests */
  getRegisteredPlugins(): PluginManifest[];

  /** Look up a single manifest by plugin ID */
  getPluginManifest(pluginId: string): PluginManifest | undefined;

  /** Check whether a plugin is enabled for a given tenant */
  isPluginEnabled(tenantId: string, pluginId: string): Promise<boolean>;

  /** Return the list of enabled plugin IDs for a tenant */
  getEnabledPlugins(tenantId: string): Promise<string[]>;

  /** Enable / disable a plugin for a tenant, with optional config */
  upsertPlugin(
    tenantId: string,
    pluginId: string,
    isEnabled: boolean,
    config?: Record<string, unknown>,
  ): Promise<any>;
}
