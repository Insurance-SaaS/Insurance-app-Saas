import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { DataSource, Table } from 'typeorm';
import { platformConnectionSettings, platformEngine } from 'src/config/database.config';
import { getDialect } from 'src/core/database/dialects';
import { TenantDataSourceManager } from 'src/core/database/tenant-datasource.manager';
import { tenantDataSourceOptions } from 'src/core/database/tenant-datasource.options';
import { TenantMigrationRunner } from 'src/core/database/tenant-migration.runner';
import { PluginRegistryService } from 'src/core/plugin-registry/plugin-registry.service';
import { User, UserRole } from 'src/modules/users/entities/user.entity';
import { OnboardTenantDto } from './dtos/onboard-tenant.dto';
import { Tenant, TenantProvisioningStatus } from './entities/tenant.entity';
import { TenantService } from './tenant.service';

/** Onboarding steps in order. A tenant's provisioningStatus is the last one completed. */
const STEPS: TenantProvisioningStatus[] = [
  'pending',
  'database_ready',
  'schema_ready',
  'admin_seeded',
  'active',
];

export interface OnboardingResult {
  tenant: Tenant;
  status: TenantProvisioningStatus;
  schema: { version: string | null; drift: number };
  tenantAdmin: { id: string; email: string; username: string };
  enabledComponents: string[];
}

/**
 * Brings a new tenant from nothing to usable, on any supported engine.
 *
 *   pending        tenant recorded (inactive), connection details validated
 *   database_ready its database exists (created by the platform, or brought by the tenant)
 *   schema_ready   the database has the current schema
 *   admin_seeded   the first tenant admin exists
 *   active         plugins recorded, tenant switched on
 *
 * Every step can be repeated safely and the last completed step is stored on the
 * tenant. If a step fails, the error is stored too and sending the same request
 * again resumes after the last completed step.
 */
@Injectable()
export class TenantOnboardingService {
  private readonly logger = new Logger(TenantOnboardingService.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly tenantMigrationRunner: TenantMigrationRunner,
    private readonly tenantDataSourceManager: TenantDataSourceManager,
    private readonly pluginRegistryService: PluginRegistryService,
    private readonly configService: ConfigService,
  ) {}

  async onboard(dto: OnboardTenantDto): Promise<OnboardingResult> {
    const slug = dto.tenant.slug.trim().toLowerCase();

    let tenant = await this.tenantService.findBySlug(slug);
    if (tenant?.provisioningStatus === 'active') {
      throw new BadRequestException(`Tenant slug "${slug}" already exists`);
    }
    tenant ??= await this.register(slug, dto);

    try {
      if (this.before(tenant, 'database_ready')) {
        await this.ensureDatabase(tenant);
        tenant = await this.advance(tenant, 'database_ready');
      }

      let schema: OnboardingResult['schema'];
      {
        // Always run: it is a no-op on a current schema and it gives us the version to report.
        const result = await this.tenantMigrationRunner.runForTenant(tenant.slug);
        if (!result.success) {
          throw new Error(`Schema setup failed: ${result.error}`);
        }
        if (result.drift?.length) {
          throw new Error(
            `Schema setup left ${result.drift.length} difference(s) from the expected schema`,
          );
        }
        schema = { version: result.version ?? null, drift: 0 };
        if (this.before(tenant, 'schema_ready')) {
          tenant = await this.advance(tenant, 'schema_ready');
        }
      }

      const admin = await this.seedTenantAdmin(tenant, dto.tenantAdmin);
      if (this.before(tenant, 'admin_seeded')) {
        tenant = await this.advance(tenant, 'admin_seeded');
      }

      const enabledComponents = await this.recordPlugins(tenant, dto.components);
      await this.tenantService.recordState(tenant.id, {
        isActive: true,
        provisioningStatus: 'active',
        provisioningError: null,
      });
      tenant = (await this.tenantService.findById(tenant.id))!;
      this.logger.log(`Tenant ${tenant.slug} onboarded on ${tenant.databaseType}`);

      return {
        tenant,
        status: 'active',
        schema,
        tenantAdmin: { id: admin.id, email: admin.email, username: admin.username },
        enabledComponents,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.tenantService.recordState(tenant.id, {
        provisioningError: message.slice(0, 1000),
      });
      this.logger.error(`Onboarding of ${slug} stopped after "${tenant.provisioningStatus}": ${message}`);
      throw new BadRequestException(
        `Onboarding stopped after step "${tenant.provisioningStatus}": ${message}. ` +
          'Fix the cause and send the same request again to resume.',
      );
    }
  }

  private before(tenant: Tenant, step: TenantProvisioningStatus): boolean {
    return STEPS.indexOf(tenant.provisioningStatus) < STEPS.indexOf(step);
  }

  private async advance(tenant: Tenant, status: TenantProvisioningStatus): Promise<Tenant> {
    await this.tenantService.recordState(tenant.id, { provisioningStatus: status });
    tenant.provisioningStatus = status;
    return tenant;
  }

  /**
   * Validates the request and records the tenant, inactive. Nothing is written
   * if the connection details cannot be used.
   */
  private async register(slug: string, dto: OnboardTenantDto): Promise<Tenant> {
    const env = (key: string) => this.configService.get<string>(key);
    const mode = dto.tenant.provisioningMode ?? (dto.tenant.databaseHost ? 'byod' : 'managed');
    const base = {
      slug,
      name: dto.tenant.name,
      config: dto.tenant.config,
      isActive: false,
      provisioningMode: mode,
      provisioningStatus: 'pending' as const,
    };

    if (mode === 'byod') {
      const details = {
        ...base,
        databaseType: dto.tenant.databaseType,
        databaseHost: dto.tenant.databaseHost,
        databasePort: dto.tenant.databasePort,
        databaseName: dto.tenant.databaseName,
        databaseUsername: dto.tenant.databaseUsername,
        databasePassword: dto.tenant.databasePassword,
        databaseOptions: dto.tenant.databaseOptions,
      };
      await this.validateBroughtDatabase(details as Tenant);
      return this.tenantService.create(details);
    }

    // Managed: the platform creates the database on its own server.
    const engine = platformEngine(env);
    if (dto.tenant.databaseType && dto.tenant.databaseType !== engine) {
      throw new BadRequestException(
        `Managed databases are created on the platform's own ${engine} server. ` +
          `For a ${dto.tenant.databaseType} tenant, provide its connection details (provisioningMode "byod").`,
      );
    }
    if (!getDialect(engine).canCreateDatabase) {
      throw new BadRequestException(
        `The platform cannot create databases on ${engine}. Provide the connection details of an ` +
          'existing empty database or schema (provisioningMode "byod").',
      );
    }
    const server = platformConnectionSettings(env);
    return this.tenantService.create({
      ...base,
      databaseType: engine,
      databaseHost: server.host,
      databasePort: server.port,
      databaseName: dto.tenant.databaseName || `tenant_${slug.replace(/[^a-z0-9_]/g, '_')}`,
      databaseUsername: server.username,
      databasePassword: server.password,
      databaseOptions: server.options,
    });
  }

  /**
   * Checks a database the tenant brought, before anything is stored: it must be
   * reachable with the given credentials and allow creating tables.
   */
  private async validateBroughtDatabase(details: Tenant): Promise<void> {
    let dataSource: DataSource | undefined;
    try {
      // No entities: this connection only probes the database.
      dataSource = await new DataSource({
        ...tenantDataSourceOptions(details),
        entities: [],
        migrations: [],
      }).initialize();

      const queryRunner = dataSource.createQueryRunner();
      const probe = `onboarding_probe_${randomBytes(4).toString('hex')}`;
      try {
        await queryRunner.createTable(
          new Table({
            name: probe,
            columns: [{ name: 'id', type: dataSource.driver.normalizeType({ type: Number }) }],
          }),
        );
        await queryRunner.dropTable(probe);
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      throw new BadRequestException(
        `The tenant database cannot be used: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      if (dataSource?.isInitialized) {
        await dataSource.destroy();
      }
    }
  }

  /** Managed tenants: create the database if it is not there yet. */
  private async ensureDatabase(tenant: Tenant): Promise<void> {
    if (tenant.provisioningMode !== 'managed') {
      return;
    }
    const env = (key: string) => this.configService.get<string>(key);
    const dialect = getDialect(tenant.databaseType);
    const server = await new DataSource(
      dialect.connectionOptions(platformConnectionSettings(env), 1),
    ).initialize();
    try {
      if (!(await dialect.databaseExists(server, tenant.databaseName!))) {
        await dialect.createDatabase(server, tenant.databaseName!);
        this.logger.log(`Created database "${tenant.databaseName}" for tenant ${tenant.slug}`);
      }
    } finally {
      await server.destroy();
    }
  }

  private async seedTenantAdmin(
    tenant: Tenant,
    admin: OnboardTenantDto['tenantAdmin'],
  ): Promise<User> {
    const dataSource = await this.tenantDataSourceManager.getDataSource(tenant);
    const users = dataSource.getRepository(User);

    const existing = await users.findOne({ where: { email: admin.email } });
    if (existing) {
      return existing; // a resumed onboarding
    }
    return users.save(
      users.create({
        username: admin.username,
        email: admin.email,
        password: await argon2.hash(admin.password),
        preferredLanguage: admin.preferredLanguage || 'en',
        role: UserRole.TENANT_ADMIN,
      }),
    );
  }

  /**
   * One row per plugin the platform knows, so "enabled" never depends on a
   * missing row. Without a component list every plugin is enabled.
   */
  private recordPlugins(
    tenant: Tenant,
    components: OnboardTenantDto['components'],
  ): Promise<string[]> {
    return this.pluginRegistryService.setTenantPlugins(tenant.id, components ?? [], {
      seedAll: true,
    });
  }
}
