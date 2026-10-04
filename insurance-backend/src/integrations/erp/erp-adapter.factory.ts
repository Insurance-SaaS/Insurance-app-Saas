import { Injectable } from '@nestjs/common';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { DefaultErpAdapter } from './adapters/default-erp.adapter';
import { NoopErpAdapter } from './adapters/noop-erp.adapter';
import { ErpAdapter } from './erp-adapter.interface';

@Injectable()
export class ErpAdapterFactory {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly defaultErpAdapter: DefaultErpAdapter,
    private readonly noopErpAdapter: NoopErpAdapter,
  ) {}

  getAdapter(): ErpAdapter {
    const tenantConfig = (this.tenantContext.getTenant()?.config ?? {}) as Record<string, any>;
    const adapterName = String(tenantConfig.erpAdapter ?? tenantConfig.erpProvider ?? 'default')
      .trim()
      .toLowerCase();

    if (adapterName === 'none' || adapterName === 'noop' || adapterName === 'disabled') {
      return this.noopErpAdapter;
    }

    return this.defaultErpAdapter;
  }
}
