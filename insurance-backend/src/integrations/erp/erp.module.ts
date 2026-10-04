import { Module, OnModuleInit } from '@nestjs/common';
import { ErpController } from './erp.controller';
import { ErpService } from './erp.service';
import { UsersModule } from 'src/modules/users/users.module';
import { CacheStorageModule } from 'src/cache_storage/cache_storage.module';
import { ContractController } from './contract.controller';
import { QuotesModule } from 'src/modules/quotes/quotes.module';
import { ErpAdapterFactory } from './erp-adapter.factory';
import { DefaultErpAdapter } from './adapters/default-erp.adapter';
import { NoopErpAdapter } from './adapters/noop-erp.adapter';
import { CustomFieldsModule } from 'src/core/custom-fields/custom-fields.module';
import { PluginRegistryService } from 'src/core/plugin-registry/plugin-registry.service';
import { ERP_PLUGIN } from './erp.plugin';

@Module({
  imports: [UsersModule, CacheStorageModule, QuotesModule, CustomFieldsModule],
  controllers: [ErpController, ContractController],
  providers: [
    ErpService,
    ErpAdapterFactory,
    DefaultErpAdapter,
    NoopErpAdapter,
  ],
  exports: [ErpService],
})
export class ErpModule implements OnModuleInit {
  constructor(private readonly pluginRegistry: PluginRegistryService) {}
  onModuleInit() {
    this.pluginRegistry.registerPlugin(ERP_PLUGIN);
  }
}
