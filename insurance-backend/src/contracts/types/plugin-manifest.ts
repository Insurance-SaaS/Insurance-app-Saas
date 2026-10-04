/**
 * @insurance/platform-core — Plugin Manifest
 *
 * Every feature module self-describes via a manifest.
 * The PluginRegistryService collects manifests at bootstrap
 * and resolves per-tenant enable/disable state from the DB.
 */

export const PLUGIN_NAMESPACE = '@insurance';

export interface PluginManifest {
  /** Unique ID in the @insurance/ namespace, e.g. '@insurance/claims' */
  id: string;

  /** Human-readable display name */
  name: string;

  /** SemVer version */
  version: string;

  /** Short description of what the plugin provides */
  description?: string;

  /** Other plugin IDs this plugin depends on */
  dependencies?: string[];

  /** Default configuration values seeded when enabled for a tenant */
  defaultConfig?: Record<string, unknown>;
}

/** Helper to build a fully-qualified plugin ID */
export function pluginId(shortName: string): string {
  if (shortName.startsWith(`${PLUGIN_NAMESPACE}/`)) {
    return shortName;
  }
  return `${PLUGIN_NAMESPACE}/${shortName}`;
}
