import { Module, OnModuleInit } from '@nestjs/common';
import { PluginRegistryService } from 'src/core/plugin-registry/plugin-registry.service';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { PAYMENT_PLUGIN_MANIFEST } from './payment.manifest';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule implements OnModuleInit {
  constructor(private readonly pluginRegistry: PluginRegistryService) {}

  onModuleInit(): void {
    this.pluginRegistry.registerPlugin(PAYMENT_PLUGIN_MANIFEST);
  }
}
