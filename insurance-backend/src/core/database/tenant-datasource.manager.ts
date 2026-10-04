import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Tenant } from 'src/core/tenant/entities/tenant.entity';
import { tenantConnectionFingerprint, tenantDataSourceOptions } from './tenant-datasource.options';

interface OpenDataSource {
  dataSource: DataSource;
  fingerprint: string;
  lastUsed: number;
}

/**
 * Owns one connection pool per tenant database.
 *
 * - Concurrent first requests for a tenant share a single initialisation.
 * - A pool is replaced when the tenant's connection details change.
 * - Pools that have not been used for a while are closed, so the number of open
 *   connections follows the tenants that are actually active.
 */
@Injectable()
export class TenantDataSourceManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TenantDataSourceManager.name);
  private readonly open = new Map<string, OpenDataSource>();
  private readonly pending = new Map<string, Promise<DataSource>>();
  private evictionTimer?: NodeJS.Timeout;

  private readonly idleMs = Number.parseInt(process.env.TENANT_DS_IDLE_MS || String(10 * 60_000), 10);

  onModuleInit(): void {
    this.evictionTimer = setInterval(
      () => void this.closeIdleDataSources(this.idleMs),
      Math.min(this.idleMs, 60_000),
    );
    // The timer must not keep the process alive on shutdown.
    this.evictionTimer.unref();
  }

  async getDataSource(tenant: Tenant): Promise<DataSource> {
    const fingerprint = tenantConnectionFingerprint(tenant);
    const existing = this.open.get(tenant.id);

    if (existing?.dataSource.isInitialized && existing.fingerprint === fingerprint) {
      existing.lastUsed = Date.now();
      return existing.dataSource;
    }

    const key = `${tenant.id}:${fingerprint}`;
    let initialising = this.pending.get(key);
    if (!initialising) {
      initialising = this.initialize(tenant, fingerprint).finally(() => this.pending.delete(key));
      this.pending.set(key, initialising);
    }
    return initialising;
  }

  private async initialize(tenant: Tenant, fingerprint: string): Promise<DataSource> {
    const previous = this.open.get(tenant.id);

    const dataSource = new DataSource(tenantDataSourceOptions(tenant));
    await dataSource.initialize();
    this.open.set(tenant.id, { dataSource, fingerprint, lastUsed: Date.now() });
    this.logger.log(`Opened ${tenant.databaseType} datasource for tenant ${tenant.slug}`);

    if (previous?.dataSource.isInitialized) {
      // Connection details changed: retire the old pool.
      await previous.dataSource.destroy().catch((error) => this.logger.warn(String(error)));
    }
    return dataSource;
  }

  async closeIdleDataSources(idleMs: number): Promise<void> {
    const now = Date.now();
    for (const [tenantId, entry] of this.open) {
      if (now - entry.lastUsed < idleMs) {
        continue;
      }
      this.open.delete(tenantId);
      if (entry.dataSource.isInitialized) {
        await entry.dataSource.destroy().catch((error) => this.logger.warn(String(error)));
      }
    }
  }

  /** Closes a tenant's pool now, e.g. after the tenant was deactivated. */
  async close(tenantId: string): Promise<void> {
    const entry = this.open.get(tenantId);
    this.open.delete(tenantId);
    if (entry?.dataSource.isInitialized) {
      await entry.dataSource.destroy();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
    }
    await Promise.allSettled(
      [...this.open.values()]
        .filter((entry) => entry.dataSource.isInitialized)
        .map((entry) => entry.dataSource.destroy()),
    );
    this.open.clear();
  }
}
