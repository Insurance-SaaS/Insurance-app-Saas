import { Injectable, Logger } from '@nestjs/common';
import { Tenant } from 'src/core/tenant/entities/tenant.entity';
import { TenantService } from 'src/core/tenant/tenant.service';
import { SchemaManager } from './schema/schema-manager';
import { TenantDataSourceManager } from './tenant-datasource.manager';

export interface TenantMigrationResult {
  tenantId: string;
  tenantSlug: string;
  success: boolean;
  /** 'provisioned' for a new database, 'migrated' for an existing one. */
  mode?: 'provisioned' | 'migrated';
  appliedMigrations?: string[];
  revertedMigrations?: string[];
  /** Newest migration recorded in the tenant database after the run. */
  version?: string | null;
  /** DDL the database is still missing compared with the entities; empty when in sync. */
  drift?: string[];
  error?: string;
}

/** A schema run holds the tenant's lease for at most this long. */
const LEASE_MS = 15 * 60_000;
const DEFAULT_CONCURRENCY = 4;

/**
 * Brings tenant databases to the current schema, one tenant at a time or all of
 * them with bounded concurrency. Each run takes a lease on the tenant so two
 * runs never overlap, and records the outcome on the tenant.
 */
@Injectable()
export class TenantMigrationRunner {
  private readonly logger = new Logger(TenantMigrationRunner.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly tenantDataSourceManager: TenantDataSourceManager,
    private readonly schemaManager: SchemaManager,
  ) {}

  async runForTenant(tenantSlug: string): Promise<TenantMigrationResult> {
    const tenant = await this.tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      return this.notFound(tenantSlug);
    }
    return this.withLease(tenant, async () => {
      const dataSource = await this.tenantDataSourceManager.getDataSource(tenant);
      const report = await this.schemaManager.ensureCurrent(dataSource);

      await this.tenantService.recordState(tenant.id, {
        schemaVersion: report.version,
        schemaCheckedAt: new Date(),
        schemaDrift: report.drift.length,
      });
      if (report.drift.length) {
        this.logger.warn(
          `Tenant ${tenant.slug} schema differs from the entities by ${report.drift.length} statement(s)`,
        );
      }
      this.logger.log(
        `Tenant ${tenant.slug}: ${report.mode}, ${report.applied.length} migration(s), version ${report.version}`,
      );

      return {
        mode: report.mode,
        appliedMigrations: report.applied,
        version: report.version,
        drift: report.drift,
      };
    });
  }

  async runForAllActiveTenants(concurrency = DEFAULT_CONCURRENCY): Promise<TenantMigrationResult[]> {
    const tenants = await this.tenantService.getActiveTenants();
    const results: TenantMigrationResult[] = new Array(tenants.length);
    let next = 0;

    // A failure on one tenant never stops the others.
    const worker = async () => {
      while (next < tenants.length) {
        const index = next++;
        results[index] = await this.runForTenant(tenants[index].slug);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, tenants.length) }, worker));
    return results;
  }

  /** Reverts a tenant's migrations, newest first, until `version` is the newest one recorded. */
  async revertTenantTo(tenantSlug: string, version: string): Promise<TenantMigrationResult> {
    const tenant = await this.tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      return this.notFound(tenantSlug);
    }
    return this.withLease(tenant, async () => {
      const dataSource = await this.tenantDataSourceManager.getDataSource(tenant);
      const reverted = await this.schemaManager.revertTo(dataSource, version);
      const current = await this.schemaManager.currentVersion(dataSource);

      await this.tenantService.recordState(tenant.id, {
        schemaVersion: current,
        schemaCheckedAt: new Date(),
      });
      return { revertedMigrations: reverted, version: current };
    });
  }

  /** Current schema version and drift of a tenant, without changing anything. */
  async status(tenantSlug: string): Promise<TenantMigrationResult> {
    const tenant = await this.tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      return this.notFound(tenantSlug);
    }
    try {
      const dataSource = await this.tenantDataSourceManager.getDataSource(tenant);
      return {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        success: true,
        version: await this.schemaManager.currentVersion(dataSource),
        drift: await this.schemaManager.drift(dataSource),
      };
    } catch (error) {
      return this.failed(tenant, error);
    }
  }

  private async withLease(
    tenant: Tenant,
    work: () => Promise<Partial<TenantMigrationResult>>,
  ): Promise<TenantMigrationResult> {
    if (!(await this.tenantService.acquireMigrationLease(tenant.id, LEASE_MS))) {
      return {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        success: false,
        error: 'A schema run is already in progress for this tenant',
      };
    }
    try {
      return { tenantId: tenant.id, tenantSlug: tenant.slug, success: true, ...(await work()) };
    } catch (error) {
      return this.failed(tenant, error);
    } finally {
      await this.tenantService.releaseMigrationLease(tenant.id);
    }
  }

  private failed(tenant: Tenant, error: unknown): TenantMigrationResult {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Schema run failed for tenant ${tenant.slug}: ${message}`);
    return { tenantId: tenant.id, tenantSlug: tenant.slug, success: false, error: message };
  }

  private notFound(tenantSlug: string): TenantMigrationResult {
    return { tenantId: 'unknown', tenantSlug, success: false, error: 'Tenant not found' };
  }
}
