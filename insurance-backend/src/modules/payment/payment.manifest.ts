import { PluginManifest, pluginId } from 'src/contracts/types/plugin-manifest';

export const PAYMENT_PLUGIN_MANIFEST: PluginManifest = {
  id: pluginId('payment'),
  name: 'Payment',
  description: 'Payment transaction processing, tracking, and status management',
  version: '1.0.0',
  dependencies: [],
};
