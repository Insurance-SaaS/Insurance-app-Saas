import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { PlatformAdmin } from 'src/core/platform-admin/entities/platform-admin.entity';
import { PlatformAdminCredential } from 'src/core/platform-admin/entities/platform-admin-credential.entity';
import { getDialect } from 'src/core/database/dialects';
import { TenantService } from 'src/core/tenant/tenant.service';
import { createDatabase, testServers } from './support/engines';
import { LATEST_TENANT_MIGRATION } from './support/migrations';
import { bootTestApp, TestApp, TEST_PASSWORD } from './support/test-app';

describe('Tenant onboarding', () => {
  let t: TestApp;
  let platformToken: string;
  const run = Date.now();

  const onboard = (body: unknown) =>
    t.request({ method: 'POST', url: '/platform/tenants/onboard', token: platformToken, body });
  const adminOf = (slug: string) => ({
    username: `admin-${slug}`,
    email: `admin@${slug}.test`,
    password: TEST_PASSWORD,
  });
  const loginAs = (slug: string) =>
    t.request({
      method: 'POST',
      url: '/auth/login',
      tenant: slug,
      body: { email: `admin@${slug}.test`, password: TEST_PASSWORD },
    });

  beforeAll(async () => {
    t = await bootTestApp();
    const platformDb = t.app.get(DataSource);
    const email = 'onboarding-root@platform.test';
    const admins = platformDb.getRepository(PlatformAdmin);
    const admin =
      (await admins.findOne({ where: { email } })) ??
      (await admins.save(admins.create({ email, fullName: 'Root', isActive: true })));
    const credentials = platformDb.getRepository(PlatformAdminCredential);
    if (!(await credentials.findOne({ where: { platformAdminId: admin.id } }))) {
      await credentials.save(
        credentials.create({ platformAdminId: admin.id, passwordHash: await argon2.hash(TEST_PASSWORD) }),
      );
    }
    const login = await t.request({
      method: 'POST',
      url: '/platform/admin-auth/login',
      body: { email, password: TEST_PASSWORD },
    });
    platformToken = login.json.accessToken;
  });

  afterAll(async () => {
    await t?.close();
  });

  const platformCanCreate = () => getDialect(process.env.TEST_PLATFORM_ENGINE).canCreateDatabase;

  it('creates a managed tenant end to end: database, schema, admin, plugins', async () => {
    if (!platformCanCreate()) return; // e.g. Oracle: tenants bring their own schema
    const slug = `managed${run}`;

    const res = await onboard({
      tenant: { slug, name: 'Managed Insurance' },
      tenantAdmin: adminOf(slug),
      components: [{ componentName: 'claims' }, { componentName: 'quotes', isEnabled: false }],
    });

    expect(res.status).toBeLessThan(300);
    expect(res.json.status).toBe('active');
    expect(res.json.schema).toEqual({ version: LATEST_TENANT_MIGRATION, drift: 0 });
    expect(res.json.enabledComponents).toEqual(['@insurance/claims']);
    expect(res.text).not.toContain('databasePassword');
    expect(res.text).not.toContain('argon2');

    const login = await loginAs(slug);
    expect(login.status).toBeLessThan(300);

    // The tenant admin can use an enabled plugin and is refused a disabled one.
    const claims = await t.request({ method: 'GET', url: '/claims/my-claims', tenant: slug, token: login.json.accessToken });
    const quotes = await t.request({ method: 'GET', url: '/quotes', tenant: slug, token: login.json.accessToken });
    expect(claims.status).toBe(200);
    expect(quotes.status).toBe(403);

    const again = await onboard({ tenant: { slug, name: 'Managed Insurance' }, tenantAdmin: adminOf(slug) });
    expect(again.status).toBe(400);
    expect(again.text).toContain('already exists');
  });

  it('onboards a tenant that brings its own database on the second engine', async () => {
    const slug = `byod${run}`;
    const database = await createDatabase(testServers()[process.env.TEST_SECOND_ENGINE!], `byod_${run}`);

    const res = await onboard({
      tenant: {
        slug,
        name: 'Brought Insurance',
        databaseType: database.engine,
        databaseHost: database.host,
        databasePort: database.port,
        databaseName: database.database,
        databaseUsername: database.username,
        databasePassword: database.password,
        databaseOptions: { trustServerCertificate: true },
      },
      tenantAdmin: adminOf(slug),
    });

    expect(res.status).toBeLessThan(300);
    expect(res.json.status).toBe('active');
    expect(res.json.tenant.provisioningMode).toBe('byod');
    expect(res.json.tenant.databaseType).toBe(process.env.TEST_SECOND_ENGINE);
    expect((await loginAs(slug)).status).toBeLessThan(300);
  });

  it('records nothing when a brought database cannot be reached', async () => {
    const slug = `unreachable${run}`;
    const server = testServers()[process.env.TEST_SECOND_ENGINE!];

    const res = await onboard({
      tenant: {
        slug,
        name: 'Unreachable',
        databaseType: server.engine,
        databaseHost: server.host,
        databasePort: server.port,
        databaseName: 'does_not_exist',
        databaseUsername: 'nobody',
        databasePassword: 'wrong-password',
        databaseOptions: { trustServerCertificate: true },
      },
      tenantAdmin: adminOf(slug),
    });

    expect(res.status).toBe(400);
    expect(res.text).toContain('cannot be used');
    expect(await t.app.get(TenantService).findBySlug(slug)).toBeNull();
  });

  it('keeps a half-onboarded tenant switched off, and resumes when the cause is fixed', async () => {
    const slug = `resume${run}`;
    const database = await createDatabase(testServers()[process.env.TEST_SECOND_ENGINE!], `resume_${run}`);
    const dialect = getDialect(database.engine);
    const direct = await new DataSource(
      dialect.connectionOptions({ ...database, options: { trustServerCertificate: true } }, 1),
    ).initialize();
    const body = {
      tenant: {
        slug,
        name: 'Resumed Insurance',
        databaseType: database.engine,
        databaseHost: database.host,
        databasePort: database.port,
        databaseName: database.database,
        databaseUsername: database.username,
        databasePassword: database.password,
        databaseOptions: { trustServerCertificate: true },
      },
      tenantAdmin: adminOf(slug),
    };

    try {
      // A table of someone else's in the database makes the schema step refuse to run.
      await direct.query('CREATE TABLE users (legacy_id int)');

      const first = await onboard(body);
      expect(first.status).toBe(400);
      expect(first.json.message).toContain('stopped after step "database_ready"');

      const stuck = await t.app.get(TenantService).findBySlug(slug);
      expect(stuck).toMatchObject({ isActive: false, provisioningStatus: 'database_ready' });
      expect(stuck!.provisioningError).toContain('users');
      expect((await loginAs(slug)).status).toBe(404); // inactive tenants do not resolve

      await direct.query('DROP TABLE users');

      const second = await onboard(body);
      expect(second.status).toBeLessThan(300);
      expect(second.json.status).toBe('active');
      expect((await loginAs(slug)).status).toBeLessThan(300);
    } finally {
      await direct.destroy();
    }
  });

  it('refuses a tenant name that could not be sent in the tenant header', async () => {
    for (const slug of ['acme insurance', 'acme.dz', '../etc', 'a'.repeat(64)]) {
      const res = await onboard({ tenant: { slug, name: 'Acme' }, tenantAdmin: adminOf('acme') });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.json.message)).toContain('slug may contain');
    }
  });

  it('reports the schema state of a tenant to platform admins', async () => {
    const res = await t.request({ method: 'GET', url: '/platform/tenants/alpha/schema', token: platformToken });

    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ success: true, version: LATEST_TENANT_MIGRATION, drift: [] });
  });
});
