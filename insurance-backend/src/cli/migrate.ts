import '../utc';
import * as dotenv from 'dotenv';
import * as path from 'node:path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { platformDataSourceOptions } from 'src/config/database.config';
import { SchemaManager, SchemaReport } from 'src/core/database/schema/schema-manager';
import { TenantDataSourceManager } from 'src/core/database/tenant-datasource.manager';
import {
  TenantMigrationResult,
  TenantMigrationRunner,
} from 'src/core/database/tenant-migration.runner';
import { Tenant } from 'src/core/tenant/entities/tenant.entity';
import { TenantService } from 'src/core/tenant/tenant.service';

const USAGE = `Usage: migrate <command>

  platform           Set up or upgrade the platform database
  tenants [slug...]  Set up or upgrade tenant databases (all active tenants, or the given ones)
  status             Show version and schema differences of every database; changes nothing

Run "platform" before "tenants" on every deployment. The exit code is non-zero if
any database failed or still differs from the schema the code expects.`;

const env = (key: string) => process.env[key];

function printReport(label: string, report: Pick<SchemaReport, 'version' | 'drift'> & Partial<SchemaReport>) {
  const applied = report.applied?.length ? `, applied: ${report.applied.join(', ')}` : '';
  console.log(`${label}: ${report.mode ?? 'checked'}, version ${report.version ?? 'none'}${applied}`);
  for (const statement of report.drift) {
    console.log(`  missing: ${statement}`);
  }
}

function printTenant(result: TenantMigrationResult): boolean {
  if (!result.success) {
    console.error(`tenant ${result.tenantSlug}: FAILED - ${result.error}`);
    return false;
  }
  printReport(`tenant ${result.tenantSlug}`, {
    mode: result.mode,
    applied: result.appliedMigrations,
    version: result.version ?? null,
    drift: result.drift ?? [],
  });
  return (result.drift ?? []).length === 0;
}

/** Prints the version and schema differences of every database; changes nothing. */
async function printStatus(
  schema: SchemaManager,
  platform: DataSource,
  tenantService: TenantService,
  runner: TenantMigrationRunner,
): Promise<number> {
  const version = await schema.currentVersion(platform);
  if (!version) {
    console.log('platform: not set up yet. Run "migrate platform" first.');
    return 1;
  }
  const drift = await schema.drift(platform);
  printReport('platform', { version, drift });

  let ok = drift.length === 0;
  for (const tenant of await tenantService.findAll()) {
    ok = printTenant(await runner.status(tenant.slug)) && ok;
  }
  return ok ? 0 : 1;
}

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);
  if (!['platform', 'tenants', 'status'].includes(command)) {
    console.log(USAGE);
    return command ? 1 : 0;
  }

  const schema = new SchemaManager();
  const platform = await new DataSource(platformDataSourceOptions(env)).initialize();
  const tenantDataSources = new TenantDataSourceManager();
  let ok = true;

  try {
    if (command === 'platform') {
      const report = await schema.ensureCurrent(platform);
      printReport('platform', report);
      return report.drift.length === 0 ? 0 : 1;
    }

    const tenantService = new TenantService(
      platform.getRepository(Tenant),
      { get: env } as unknown as ConfigService,
    );
    const runner = new TenantMigrationRunner(tenantService, tenantDataSources, schema);

    if (command === 'status') {
      return await printStatus(schema, platform, tenantService, runner);
    }

    const results = args.length
      ? await Promise.all(args.map((slug) => runner.runForTenant(slug)))
      : await runner.runForAllActiveTenants();
    for (const result of results) {
      ok = printTenant(result) && ok;
    }
    return ok ? 0 : 1;
  } finally {
    await tenantDataSources.onModuleDestroy();
    await platform.destroy();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
