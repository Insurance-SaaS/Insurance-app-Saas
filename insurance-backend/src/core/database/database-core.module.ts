import { Global, Module } from '@nestjs/common';
import { TenantDataSourceManager } from './tenant-datasource.manager';
import { TenantDataSourceMiddleware } from './tenant-datasource.middleware';
import { TenantRepositoryFactory } from './tenant-repository.factory';
import { TenantMigrationRunner } from './tenant-migration.runner';
import { SchemaManager } from './schema/schema-manager';

@Global()
@Module({
  providers: [
    TenantDataSourceManager,
    TenantDataSourceMiddleware,
    TenantRepositoryFactory,
    TenantMigrationRunner,
    SchemaManager,
  ],
  exports: [
    TenantDataSourceManager,
    TenantDataSourceMiddleware,
    TenantRepositoryFactory,
    TenantMigrationRunner,
    SchemaManager,
  ],
})
export class DatabaseCoreModule {}
