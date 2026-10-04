import { Module, OnModuleInit } from '@nestjs/common';
import { ClaimsService } from './claims.service';
import { ClaimsController } from './claims.controller';
import { UsersModule } from 'src/modules/users/users.module';
import { CacheStorageModule } from 'src/cache_storage/cache_storage.module';
import { LocationValidationService } from 'src/shared/services/location-validation.service';
import { CustomFieldsModule } from 'src/core/custom-fields/custom-fields.module';
import { CLAIMS_SERVICE } from 'src/contracts/tokens';
import { PluginRegistryService } from 'src/core/plugin-registry/plugin-registry.service';
import { CLAIMS_PLUGIN } from './claims.plugin';

@Module({
  imports: [UsersModule, CacheStorageModule, CustomFieldsModule],
  providers: [
    ClaimsService,
    LocationValidationService,
    { provide: CLAIMS_SERVICE, useExisting: ClaimsService },
  ],
  controllers: [ClaimsController],
  exports: [ClaimsService, CLAIMS_SERVICE],
})
export class ClaimsModule implements OnModuleInit {
  constructor(private readonly pluginRegistry: PluginRegistryService) {}
  onModuleInit() {
    this.pluginRegistry.registerPlugin(CLAIMS_PLUGIN);
  }
}
