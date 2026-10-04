import { SetMetadata } from "@nestjs/common";

/**
 * Marks a controller or route as requiring a specific plugin to be enabled
 * for the current tenant. Used in conjunction with the PluginGuard.
 *
 * @param pluginId  Full plugin ID, e.g. '@insurance/claims'
 */
export const RequiresPlugin = (pluginId: string) =>
  SetMetadata("requiredPlugin", pluginId);
