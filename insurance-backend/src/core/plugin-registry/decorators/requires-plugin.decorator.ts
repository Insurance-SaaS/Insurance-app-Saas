import { SetMetadata } from '@nestjs/common';

export const PLUGIN_NAME_METADATA = 'plugin_name';

/**
 * Marks a controller or handler as requiring a specific plugin.
 * Used with PluginGuard to gate access per tenant.
 *
 * @example @RequiresPlugin('@insurance/claims')
 */
export const RequiresPlugin = (pluginId: string) => SetMetadata(PLUGIN_NAME_METADATA, pluginId);
