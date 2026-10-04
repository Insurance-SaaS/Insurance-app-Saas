import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheStorageModule } from 'src/cache_storage/cache_storage.module';
import { CustomFieldDefinition } from './entities/custom-field-definition.entity';
import { CustomFieldsService } from './custom-fields.service';
import { CustomFieldsController } from './custom-fields.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CustomFieldDefinition]), CacheStorageModule],
  providers: [CustomFieldsService],
  controllers: [CustomFieldsController],
  exports: [CustomFieldsService],
})
export class CustomFieldsModule {}
