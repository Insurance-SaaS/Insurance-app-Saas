import { PluginManifest } from 'src/contracts/types/plugin-manifest';

export const ERP_PLUGIN: PluginManifest = {
  id: '@insurance/erp',
  name: 'ERP Integration',
  version: '1.0.0',
  description: 'Bi-directional sync with external ERP / core-insurance systems',
  dependencies: ['@insurance/quotes'],
};
