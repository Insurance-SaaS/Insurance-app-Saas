import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { TenantDataSourceManager } from './tenant-datasource.manager';

@Injectable()
export class TenantDataSourceMiddleware implements NestMiddleware {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly tenantDataSourceManager: TenantDataSourceManager,
  ) {}

  async use(req: FastifyRequest, res: FastifyReply, next: (err?: Error) => void): Promise<void> {
    const tenant = this.tenantContext.getTenant();

    if (!tenant) {
      next();
      return;
    }

    try {
      const dataSource = await this.tenantDataSourceManager.getDataSource(tenant);
      this.tenantContext.setDataSource(dataSource);
      (req as any).tenantDataSource = dataSource;
    } catch (error) {
      next(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    next();
  }
}
