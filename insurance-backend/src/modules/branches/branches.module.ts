import { Module, OnModuleInit } from '@nestjs/common';
import { BranchesService } from './services/branches.service';
import { BranchesController } from './controllers/branches.controller';
import { ContactsService } from './services/contacts.service';
import { ContactsController } from './controllers/contacts.controller';
import { CustomFieldsModule } from 'src/core/custom-fields/custom-fields.module';
import { PluginRegistryService } from 'src/core/plugin-registry/plugin-registry.service';
import { BRANCHES_PLUGIN } from './branches.plugin';

@Module({
  imports: [CustomFieldsModule],
  providers: [BranchesService, ContactsService],
  controllers: [BranchesController, ContactsController],
})
export class BranchesModule implements OnModuleInit {
  constructor(private readonly pluginRegistry: PluginRegistryService) {}
  onModuleInit() {
    this.pluginRegistry.registerPlugin(BRANCHES_PLUGIN);
  }
}
