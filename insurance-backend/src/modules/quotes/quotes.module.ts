import { Module, OnModuleInit } from '@nestjs/common';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { CacheStorageModule } from 'src/cache_storage/cache_storage.module';
import { QUOTES_SERVICE } from 'src/contracts/tokens';
import { PluginRegistryService } from 'src/core/plugin-registry/plugin-registry.service';
import { QUOTES_PLUGIN } from './quotes.plugin';

@Module({
  imports: [CacheStorageModule],
  controllers: [QuotesController],
  providers: [QuotesService, { provide: QUOTES_SERVICE, useExisting: QuotesService }],
  exports: [QuotesService, QUOTES_SERVICE],
})
export class QuotesModule implements OnModuleInit {
  constructor(private readonly pluginRegistry: PluginRegistryService) {}
  onModuleInit() {
    this.pluginRegistry.registerPlugin(QUOTES_PLUGIN);
  }
}
