import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { PlatformAdmin } from 'src/core/platform-admin/entities/platform-admin.entity';
import { PlatformAdminCredential } from 'src/core/platform-admin/entities/platform-admin-credential.entity';
import { bootTestApp, TestApp, TEST_PASSWORD } from './support/test-app';

describe('Per-tenant plugins', () => {
  let t: TestApp;
  let platformToken: string;

  const setComponents = (tenantId: string, components: { componentName: string; isEnabled: boolean }[]) =>
    t.request({
      method: 'PUT',
      url: `/platform/tenants/${tenantId}/components`,
      token: platformToken,
      body: { components },
    });
  const asUser = (tenant: 'alpha' | 'beta', url: string) =>
    t.request({ method: 'GET', url, tenant: t[tenant].slug, token: t[tenant].user.token });

  beforeAll(async () => {
    t = await bootTestApp();
    const platformDb = t.app.get(DataSource);
    const email = 'plugins-root@platform.test';
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
    // Leave both tenants with everything enabled for the other suites.
    await setComponents(t.beta.id, [
      { componentName: 'branches', isEnabled: true },
      { componentName: 'payment', isEnabled: true },
    ]);
    await t?.close();
  });

  it('gate every controller of a module, for the tenant that turned it off only', async () => {
    expect((await asUser('beta', '/contacts')).status).toBe(200);
    expect((await asUser('beta', '/branches')).status).toBe(200);

    const off = await setComponents(t.beta.id, [{ componentName: 'branches', isEnabled: false }]);
    expect(off.status).toBe(200);

    expect((await asUser('beta', '/contacts')).status).toBe(403);
    expect((await asUser('beta', '/branches')).status).toBe(403);
    // Another tenant is unaffected.
    expect((await asUser('alpha', '/contacts')).status).toBe(200);
    // A module that is still on keeps working.
    expect((await asUser('beta', '/claims/my-claims')).status).toBe(200);
  });

  it('cannot leave a plugin enabled without what it depends on', async () => {
    const res = await setComponents(t.beta.id, [{ componentName: 'quotes', isEnabled: false }]);

    expect(res.status).toBe(400);
    expect(res.json.message).toContain('requires "@insurance/quotes"');
    expect((await asUser('beta', '/quotes')).status).not.toBe(403);
  });

  it('accept turning a plugin off together with everything that depends on it', async () => {
    const res = await setComponents(t.beta.id, [
      { componentName: 'quotes', isEnabled: false },
      { componentName: 'ai', isEnabled: false },
      { componentName: 'erp', isEnabled: false },
    ]);
    expect(res.status).toBe(200);
    expect((await asUser('beta', '/quotes')).status).toBe(403);

    const back = await setComponents(t.beta.id, [
      { componentName: 'quotes', isEnabled: true },
      { componentName: 'ai', isEnabled: true },
      { componentName: 'erp', isEnabled: true },
    ]);
    expect(back.status).toBe(200);
  });

  it('start a newly registered tenant with an explicit row for every plugin', async () => {
    const created = await t.request({
      method: 'POST',
      url: '/platform/tenants',
      token: platformToken,
      body: { slug: `plugins-${Date.now()}`, name: 'Plugins' },
    });
    expect(created.status).toBeLessThan(300);

    const components = await t.request({
      method: 'GET',
      url: `/platform/tenants/${created.json.id}/components`,
      token: platformToken,
    });

    expect(components.status).toBe(200);
    expect(components.json.map((c: { componentName: string }) => c.componentName).sort()).toEqual([
      '@insurance/ai',
      '@insurance/branches',
      '@insurance/claims',
      '@insurance/erp',
      '@insurance/notifications',
      '@insurance/payment',
      '@insurance/quotes',
    ]);
    expect(components.json.every((c: { isEnabled: boolean }) => c.isEnabled)).toBe(true);
  });
});
