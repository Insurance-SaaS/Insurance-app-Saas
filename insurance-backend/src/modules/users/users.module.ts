import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CacheStorageModule } from 'src/cache_storage/cache_storage.module';
import { CustomFieldsModule } from 'src/core/custom-fields/custom-fields.module';
import { USERS_SERVICE } from 'src/contracts/tokens';
@Module({
  imports: [CacheStorageModule, CustomFieldsModule],
  controllers: [UsersController],
  providers: [UsersService, { provide: USERS_SERVICE, useExisting: UsersService }],
  exports: [UsersService, USERS_SERVICE],
})
export class UsersModule {}
