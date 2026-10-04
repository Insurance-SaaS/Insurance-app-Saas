import { Module, OnModuleInit } from '@nestjs/common';
import { AiOpenAIService } from './ai-openai.service';
import { AiController } from './ai.controller';
import { OpenAIClientService } from './openai-client.service';
import { AiSessionStore } from './ai-session.store';
import { AiImageAnalysisService } from './ai-image-analysis.service';
import { CacheStorageModule } from 'src/cache_storage/cache_storage.module';
import { ClaimsModule } from 'src/modules/claims/claims.module';
import { QuotesModule } from 'src/modules/quotes/quotes.module';
import { PluginRegistryService } from 'src/core/plugin-registry/plugin-registry.service';
import { AI_PLUGIN } from './ai.plugin';

@Module({
  imports: [ClaimsModule, QuotesModule, CacheStorageModule],
  providers: [AiOpenAIService, OpenAIClientService, AiSessionStore, AiImageAnalysisService],
  controllers: [AiController],
  exports: [AiOpenAIService],
})
export class AiModule implements OnModuleInit {
  constructor(private readonly pluginRegistry: PluginRegistryService) {}
  onModuleInit() {
    this.pluginRegistry.registerPlugin(AI_PLUGIN);
  }
}
