import { PluginManifest } from 'src/contracts/types/plugin-manifest';

export const AI_PLUGIN: PluginManifest = {
  id: '@insurance/ai',
  name: 'AI Assistant',
  version: '1.0.0',
  description: 'Conversational AI for claim submission and quote recommendation',
  dependencies: ['@insurance/claims', '@insurance/quotes'],
};
