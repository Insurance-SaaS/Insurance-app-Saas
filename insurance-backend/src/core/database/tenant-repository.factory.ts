import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { getDialect } from './dialects';

/**
 * Repositories for tenant data. They only ever come from the DataSource of the
 * tenant resolved for the current request; without one this throws instead of
 * falling back to the platform database.
 */
@Injectable()
export class TenantRepositoryFactory {
  constructor(private readonly tenantContext: TenantContextService) {}

  private requireDataSource(): DataSource {
    const dataSource = this.tenantContext.getDataSource();
    if (!dataSource) {
      throw new BadRequestException('X-Tenant-ID header is required');
    }
    return dataSource;
  }

  getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T> {
    return this.requireDataSource().getRepository(entity);
  }

  /** True if the error is a unique-constraint violation on the current tenant's engine. */
  isUniqueViolation(error: unknown): boolean {
    return getDialect(this.requireDataSource().options.type).isUniqueViolation(error);
  }

  /** Runs `work` in one transaction on the current tenant's database. */
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.requireDataSource().transaction(work);
  }
}
