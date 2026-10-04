import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { PlatformAdmin } from 'src/core/platform-admin/entities/platform-admin.entity';
import { PlatformAdminCredential } from 'src/core/platform-admin/entities/platform-admin-credential.entity';
import { Tenant } from 'src/core/tenant/entities/tenant.entity';
import { TenantRepositoryFactory } from 'src/core/database/tenant-repository.factory';
import { User } from 'src/modules/users/entities/user.entity';
import { bootTestApp, TestApp, TEST_PASSWORD } from './support/test-app';

describe('Tenancy', () => {
  let t: TestApp;
  let platformToken: string;

  beforeAll(async () => {
    t = await bootTestApp();

    const platformDb = t.app.get(DataSource);
    const admins = platformDb.getRepository(PlatformAdmin);
    const email = 'tenancy-root@platform.test';
    const admin =
      (await admins.findOne({ where: { email } })) ??
      (await admins.save(admins.create({ email, fullName: 'Root', isActive: true })));
    const credentials = platformDb.getRepository(PlatformAdminCredential);
    if (!(await credentials.findOne({ where: { platformAdminId: admin.id } }))) {
      await credentials.save(
        credentials.create({
          platformAdminId: admin.id,
          passwordHash: await argon2.hash(TEST_PASSWORD),
        }),
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

  describe('the tenant header', () => {
    it.each([
      ['POST', '/auth/login', { email: 'user@alpha.test', password: TEST_PASSWORD }],
      ['POST', '/auth/signup', { email: 'x@alpha.test', password: TEST_PASSWORD, username: 'xxxxx', phone: '+213661000099' }],
      ['GET', '/auth/profile', undefined],
      ['GET', '/claims/my-claims', undefined],
      ['GET', '/branches', undefined],
    ] as const)('is required on %s %s', async (method, url, body) => {
      const res = await t.request({ method, url, body, token: t.alpha.user.token });

      expect(res.status).toBe(400);
      expect(res.text).toContain('X-Tenant-ID');
    });

    it('answers "no such tenant" for an unknown name without asking the database each time', async () => {
      const lookups = jest.spyOn(t.app.get(DataSource).getRepository(Tenant), 'findOne');
      const probe = (tenant: string) =>
        t.request({ method: 'GET', url: '/branches', tenant, token: t.alpha.user.token });
      try {
        const unknown = `ghost${Date.now()}`;
        const statuses = [await probe(unknown), await probe(unknown), await probe(unknown)].map((r) => r.status);
        // Values that cannot be a tenant name are not looked up at all.
        const malformed = [await probe("x' OR '1'='1"), await probe('a'.repeat(200)), await probe('ALPHA')];

        expect(statuses).toEqual([404, 404, 404]);
        expect(malformed.map((r) => r.status)).toEqual([404, 404, 404]);
        expect(lookups).toHaveBeenCalledTimes(1);
      } finally {
        lookups.mockRestore();
      }
    });

    it('is not needed on platform and tenant-less routes', async () => {
      const tenants = await t.request({ method: 'GET', url: '/platform/tenants', token: platformToken });
      const config = await t.request({ method: 'GET', url: '/tenant/config' });

      expect(tenants.status).toBe(200);
      expect(config.status).toBe(200);
    });
  });

  describe('data isolation', () => {
    it('keeps each tenant\'s users in its own database', async () => {
      const inBeta = await t.request({
        method: 'POST',
        url: '/auth/login',
        tenant: t.beta.slug,
        body: { email: t.alpha.user.email, password: TEST_PASSWORD },
      });
      expect(inBeta.status).toBe(401);

      const alphaUsers = await (await t.tenantDataSource(t.alpha)).getRepository(User).find();
      const betaUsers = await (await t.tenantDataSource(t.beta)).getRepository(User).find();
      expect(alphaUsers.every((u) => u.email.endsWith('@alpha.test') || u.email.endsWith('@platform.test'))).toBe(true);
      expect(betaUsers.every((u) => u.email.endsWith('@beta.test'))).toBe(true);
    });

    it('keeps tenant tables out of the platform database entirely', async () => {
      const platform = t.app.get(DataSource);
      const queryRunner = platform.createQueryRunner();
      try {
        expect(platform.hasMetadata(User)).toBe(false);
        expect(await queryRunner.hasTable('users')).toBe(false);
        expect(await queryRunner.hasTable('claims')).toBe(false);
        expect(await queryRunner.hasTable('tenants')).toBe(true);
      } finally {
        await queryRunner.release();
      }
    });

    it('serves the two tenants from their own database engines', async () => {
      const alpha = await t.tenantDataSource(t.alpha);
      const beta = await t.tenantDataSource(t.beta);

      expect(alpha.options.type).toBe(process.env.TEST_PLATFORM_ENGINE);
      expect(beta.options.type).toBe(process.env.TEST_SECOND_ENGINE);
    });

    it('refuses to hand out a tenant repository outside a tenant request', () => {
      expect(() => t.app.get(TenantRepositoryFactory).getRepository(User)).toThrow(
        'X-Tenant-ID header is required',
      );
    });
  });

  describe('tenant database credentials', () => {
    it('are stored encrypted and never returned', async () => {
      const created = await t.request({
        method: 'POST',
        url: '/platform/tenants',
        token: platformToken,
        body: {
          slug: `gamma-${Date.now()}`,
          name: 'Gamma',
          databaseType: 'postgres',
          databaseHost: 'db.example.internal',
          databasePort: 5432,
          databaseName: 'gamma',
          databaseUsername: 'gamma',
          databasePassword: 'plain-text-secret',
        },
      });
      expect(created.status).toBeLessThan(300);
      expect(created.text).not.toContain('plain-text-secret');
      expect(created.json.databasePassword).toBeUndefined();

      const stored = await t.app
        .get(DataSource)
        .getRepository(Tenant)
        .findOneOrFail({ where: { id: created.json.id } });
      expect(stored.databasePassword).toMatch(/^enc:v1:/);
      expect(stored.databasePassword).not.toContain('plain-text-secret');

      const list = await t.request({ method: 'GET', url: '/platform/tenants', token: platformToken });
      expect(list.status).toBe(200);
      expect(list.text).not.toContain('enc:v1:');
      expect(list.text).not.toContain('databasePassword');
    });
  });
});
