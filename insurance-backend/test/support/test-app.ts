import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { AppModule } from 'src/app.module';
import { configureApp, createFastifyAdapter } from 'src/app.setup';
import { TenantDataSourceManager } from 'src/core/database/tenant-datasource.manager';
import { PluginRegistryService } from 'src/core/plugin-registry/plugin-registry.service';
import { Tenant } from 'src/core/tenant/entities/tenant.entity';
import { TenantService } from 'src/core/tenant/tenant.service';
import { User, UserRole } from 'src/modules/users/entities/user.entity';
import { RedisService } from 'src/cache_storage/services/redis.service';
import { NodemailerEmailProvider } from 'src/integrations/email/providers/nodemailer-email.provider';
import { InfobipSmsProvider } from 'src/integrations/sms/providers/infobip-sms.provider';
import { MinioService } from 'src/cache_storage/services/minio.service';
import { SchemaManager } from 'src/core/database/schema/schema-manager';
import { createDatabase, testServers } from './engines';
import { FakeLlm } from './fake-llm';
import { OpenAIClientService } from 'src/modules/ai/openai-client.service';
import { LocationValidationService } from 'src/shared/services/location-validation.service';
import { buildTenantCacheKey } from 'src/shared/utils/cache-key.util';

export const API = '/api/v1';
export const TEST_PASSWORD = 'Passw0rd!test';

export interface TestUser {
  id: string;
  email: string;
  role: UserRole;
  /** Access token bound to this user's tenant. */
  token: string;
}

export interface TestTenant {
  id: string;
  slug: string;
  /** Database engine this tenant's own database runs on. */
  engine: string;
  admin: TestUser;
  user: TestUser;
  otherUser: TestUser;
}

export interface Outbox {
  emails: { to: string; subject: string; text?: string }[];
  sms: { to: string; message: string }[];
  /** Set to make every email and SMS fail, as when the provider is down. */
  failing?: boolean;
}

/** In-memory stand-in for object storage. */
export class FakeObjectStorage {
  readonly objects = new Map<string, { buffer: Buffer; contentType?: string }>();

  /** Uploads still allowed before storage "goes down"; unset means it never does. */
  uploadsBeforeFailure?: number;

  async uploadFile(bucket: string, objectName: string, buffer: Buffer, contentType?: string) {
    if (this.uploadsBeforeFailure !== undefined && this.uploadsBeforeFailure-- <= 0) {
      throw new Error('Object storage write failed');
    }
    const url = `memory://${bucket}/${objectName}`;
    this.objects.set(url, { buffer, contentType });
    return url;
  }

  async deleteFile(url: string) {
    this.objects.delete(url);
  }

  /** Set to make reads fail, to test how callers cope with storage being down. */
  failDownloads = false;

  async downloadFile(url: string) {
    const object = this.objects.get(url);
    if (this.failDownloads || !object) {
      throw new Error(`Object storage read failed: ${url}`);
    }
    return object.buffer;
  }

  async getPresignedGetUrl(url: string) {
    return this.objects.has(url) ? `${url}?signed=1` : null;
  }

  async invalidatePresignedCache() {
    // nothing cached
  }
}

export interface BootOptions {
  /** Keep the real rate limiter (off by default: it only adds 429 noise to other tests). */
  throttling?: boolean;
}

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path below the API prefix, e.g. '/auth/login'. Pass `raw: true` for unprefixed paths. */
  url: string;
  raw?: boolean;
  /** Sent as X-Tenant-ID. */
  tenant?: string;
  /** Sent as a Bearer token. */
  token?: string;
  body?: unknown;
  /** Raw payload (e.g. multipart); set the content-type header yourself. */
  payload?: Buffer | string;
  headers?: Record<string, string>;
}

/**
 * The real application (same pipes, filters and middleware as main.ts) wired to
 * the containers from global-setup, with two tenants and three users in each.
 */
export class TestApp {
  constructor(
    readonly app: NestFastifyApplication,
    readonly alpha: TestTenant,
    readonly beta: TestTenant,
    /** Messages the application tried to send; nothing leaves the process. */
    readonly outbox: Outbox,
    readonly storage: FakeObjectStorage,
    /** The scripted model behind the AI assistant. */
    readonly llm: FakeLlm,
  ) {}

  async request(options: RequestOptions) {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.tenant) headers['x-tenant-id'] = options.tenant;
    if (options.token) headers['authorization'] = `Bearer ${options.token}`;

    const response = await this.app.inject({
      method: options.method,
      url: options.raw ? options.url : `${API}${options.url}`,
      headers,
      payload: (options.payload ?? options.body) as any,
    });

    let json: any = undefined;
    try {
      json = response.json();
    } catch {
      // not a JSON response
    }
    return { status: response.statusCode, json, text: response.body, headers: response.headers };
  }

  /** Direct access to a tenant's database, for arranging data a test needs. */
  async tenantDataSource(tenant: TestTenant): Promise<DataSource> {
    const record = await this.app.get(TenantService).findBySlug(tenant.slug);
    return this.app.get(TenantDataSourceManager).getDataSource(record!);
  }

  /** Creates one more user in a tenant, for tests that change the account. */
  async createUser(tenant: TestTenant, name: string, role = UserRole.USER): Promise<TestUser> {
    return seedUser(await this.tenantDataSource(tenant), tenant.slug, name, role);
  }

  /** Reads the OTP the application generated, as the user would from the email or SMS. */
  async readOtp(tenant: TestTenant, purpose: string, identifier: string): Promise<number> {
    const raw = await this.app
      .get(RedisService)
      .get(buildTenantCacheKey(tenant.slug, 'otp', purpose, identifier));
    if (!raw) {
      throw new Error(`No OTP stored for ${purpose}:${identifier}`);
    }
    return Number(JSON.parse(raw));
  }

  async close(): Promise<void> {
    await this.app.close();
  }
}

/** A provider that records the message instead of sending it, or fails when told to. */
function deliverTo<T>(outbox: Outbox, box: T[]) {
  return async (message: T): Promise<void> => {
    if (outbox.failing) {
      throw new Error('connect ECONNREFUSED 10.0.0.25:587');
    }
    box.push(message);
  };
}

export async function bootTestApp(options: BootOptions = {}): Promise<TestApp> {
  const outbox: Outbox = { emails: [], sms: [] };
  const storage = new FakeObjectStorage();
  const llm = new FakeLlm();
  // Geocoding is an external service; every address is accepted as given.
  const geocoder = {
    validateLocation: async (location: string) => ({ isValid: true, formattedAddress: location }),
    validateLocationWithMessage: async (location: string) => ({
      isValid: true,
      formattedAddress: location,
    }),
    validateLocationsBatch: async (locations: string[]) =>
      locations.map((location) => ({ location, isValid: true })),
  };
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (!options.throttling) {
    builder = builder.overrideProvider(ThrottlerGuard).useValue({ canActivate: () => true });
  }
  const moduleRef = await builder
    .overrideProvider(MinioService)
    .useValue(storage)
    .overrideProvider(OpenAIClientService)
    .useValue(llm)
    .overrideProvider(LocationValidationService)
    .useValue(geocoder)
    .overrideProvider(NodemailerEmailProvider)
    .useValue({ send: deliverTo(outbox, outbox.emails) })
    .overrideProvider(InfobipSmsProvider)
    .useValue({ send: deliverTo(outbox, outbox.sms) })
    .compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter());
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  if (options.throttling) {
    // The counters live in Redis and outlast the process: start each run from zero.
    const redis = app.get(RedisService).getClient();
    const counters = await redis.keys('throttle:*');
    if (counters.length > 0) {
      await redis.del(...counters);
    }
  }

  // Two tenants, each with its own database. With the default settings they are
  // on different engines, served by this one application process.
  const alpha = await seedTenant(app, 'alpha', process.env.TEST_PLATFORM_ENGINE!);
  const beta = await seedTenant(app, 'beta', process.env.TEST_SECOND_ENGINE!);
  return new TestApp(app, alpha, beta, outbox, storage, llm);
}

async function seedTenant(
  app: NestFastifyApplication,
  slug: string,
  engine: string,
): Promise<TestTenant> {
  const tenantService = app.get(TenantService);
  const dataSourceManager = app.get(TenantDataSourceManager);
  const pluginRegistry = app.get(PluginRegistryService);

  const database = await createDatabase(testServers()[engine], `tenant_${slug}`);

  const tenant: Tenant =
    (await tenantService.findBySlug(slug)) ??
    (await tenantService.create({
      slug,
      name: `Tenant ${slug}`,
      isActive: true,
      databaseType: database.engine,
      databaseHost: database.host,
      databasePort: database.port,
      databaseName: database.database,
      databaseUsername: database.username,
      databasePassword: database.password,
      databaseOptions: { trustServerCertificate: true },
    }));

  // The same path production uses: an empty database gets the current schema
  // from the entities; one that was set up before only runs pending migrations.
  const tenantDataSource = await dataSourceManager.getDataSource(tenant);
  const report = await app.get(SchemaManager).ensureCurrent(tenantDataSource);
  if (report.drift.length) {
    throw new Error(
      `Schema of tenant ${slug} (${engine}) differs from the entities:\n${report.drift.join('\n')}`,
    );
  }

  await pluginRegistry.setTenantPlugins(tenant.id, [], { seedAll: true });

  return {
    id: tenant.id,
    slug,
    engine,
    admin: await seedUser(tenantDataSource, slug, 'admin', UserRole.TENANT_ADMIN),
    user: await seedUser(tenantDataSource, slug, 'user', UserRole.USER),
    otherUser: await seedUser(tenantDataSource, slug, 'other', UserRole.USER),
  };
}

async function seedUser(
  tenantDataSource: DataSource,
  slug: string,
  name: string,
  role: UserRole,
): Promise<TestUser> {
  const users = tenantDataSource.getRepository(User);
  const email = `${name}@${slug}.test`;
  const user =
    (await users.findOne({ where: { email } })) ??
    (await users.save(
      users.create({
        username: `${name}-${slug}`,
        email,
        password: await argon2.hash(TEST_PASSWORD),
        role,
      }),
    ));
  const token = new JwtService().sign(
    { sub: user.id, email: user.email, tenantSlug: slug },
    { secret: process.env.JWT_SECRET_KEY, expiresIn: '15m' },
  );
  return { id: user.id, email, role, token };
}
