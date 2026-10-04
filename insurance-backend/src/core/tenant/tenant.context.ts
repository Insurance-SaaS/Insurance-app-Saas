import { BadRequestException, Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DataSource } from 'typeorm';
import { Tenant } from './entities/tenant.entity';

export interface TenantRequestContext {
  tenant?: Tenant;
  dataSource?: DataSource;
  /** Pre-resolved enabled plugin IDs for the current tenant (set by PluginResolutionMiddleware). */
  enabledPlugins?: Set<string>;
}

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantRequestContext>();

  runWithContext(context: TenantRequestContext, callback: () => void | Promise<void>): void {
    void this.storage.run(context, callback);
  }

  /** Runs `work` inside the given context and returns its result. */
  runInContext<T>(context: TenantRequestContext, work: () => Promise<T>): Promise<T> {
    return this.storage.run(context, work);
  }

  getContext(): TenantRequestContext {
    return this.storage.getStore() ?? {};
  }

  setTenant(tenant: Tenant): void {
    const store = this.storage.getStore();
    if (store) {
      store.tenant = tenant;
    }
  }

  getTenant(): Tenant | undefined {
    return this.storage.getStore()?.tenant;
  }

  /**
   * The tenant of the current request, or an error. Tenant-scoped code uses this
   * instead of falling back to a shared default, so a request that carries no
   * tenant can never read or write another scope's data.
   */
  requireTenant(): Tenant {
    const tenant = this.getTenant();
    if (!tenant) {
      throw new BadRequestException('X-Tenant-ID header is required');
    }
    return tenant;
  }

  setDataSource(dataSource: DataSource): void {
    const store = this.storage.getStore();
    if (store) {
      store.dataSource = dataSource;
    }
  }

  getDataSource(): DataSource | undefined {
    return this.storage.getStore()?.dataSource;
  }

  // ── Plugin context ─────────────────────────────────────────────────

  /** Store the pre-resolved set of enabled plugin IDs for this request. */
  setEnabledPlugins(pluginIds: string[]): void {
    const store = this.storage.getStore();
    if (store) {
      store.enabledPlugins = new Set(pluginIds);
    }
  }

  /** Get the pre-resolved enabled plugins (undefined if not yet resolved). */
  getEnabledPlugins(): Set<string> | undefined {
    return this.storage.getStore()?.enabledPlugins;
  }

  /** Whether the plugin is enabled for the tenant of the current context. */
  isPluginEnabled(pluginId: string): boolean {
    // Nothing resolved means no tenant context: nothing is enabled.
    return this.storage.getStore()?.enabledPlugins?.has(pluginId) ?? false;
  }
}
