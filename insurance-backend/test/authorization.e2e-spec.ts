import { PlatformAdminService } from 'src/core/platform-admin/platform-admin.service';
import { ModulesContainer } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { IS_PUBLIC_KEY } from 'src/auth/decorators/public.decorator';
import { PlatformAdmin } from 'src/core/platform-admin/entities/platform-admin.entity';
import { PlatformAdminCredential } from 'src/core/platform-admin/entities/platform-admin-credential.entity';
import { bootTestApp, TestApp, TEST_PASSWORD } from './support/test-app';

const PLATFORM_ADMIN_EMAIL = 'root@platform.test';

/** Routes that are reachable without a token. Adding one must be a deliberate change here. */
const EXPECTED_PUBLIC_ROUTES = [
  'GET /',
  'GET /auth/google',
  'GET /auth/google/redirect',
  'GET /branches',
  'GET /branches/:id',
  'GET /branches/code/:code',
  'GET /branches/map',
  'GET /tenant/config',
  'GET /translation/health',
  'GET /translation/languages',
  'PATCH /auth/reset-password',
  'POST /auth/google/mobile',
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/resend-otp-email',
  'POST /auth/resend-otp-sms',
  'POST /auth/reset-password-otp',
  'POST /auth/send-otp-sms',
  'POST /auth/signup',
  'POST /auth/verify-otp',
  'POST /auth/verify-otp-email',
  'POST /auth/verify-otp-reset',
  'POST /auth/verify-otp-sms',
  'POST /platform/admin-auth/login',
  'POST /platform/admin-auth/refresh',
];

interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  isPublic: boolean;
}

/** Every route the application registers, read from the controllers' own metadata. */
function listRoutes(t: TestApp): Route[] {
  const routes: Route[] = [];
  for (const module of t.app.get(ModulesContainer).values()) {
    for (const controller of module.controllers.values()) {
      const cls = controller.metatype as any;
      if (!cls?.prototype) continue;
      const base: string = Reflect.getMetadata(PATH_METADATA, cls) ?? '';

      for (const name of Object.getOwnPropertyNames(cls.prototype)) {
        const handler = cls.prototype[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const sub = Reflect.getMetadata(PATH_METADATA, handler);
        const method = Reflect.getMetadata(METHOD_METADATA, handler);
        if (sub === undefined || method === undefined) continue;

        // A handler can answer on several paths (a route and its former name).
        for (const alias of Array.isArray(sub) ? sub : [sub]) {
          const path = `/${[base, alias].filter((p) => p && p !== '/').join('/')}`.replace(/\/+/g, '/');
          routes.push({
            method: RequestMethod[method] as Route['method'],
            path,
            isPublic: Boolean(
              Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, cls),
            ),
          });
        }
      }
    }
  }
  return routes;
}

describe('Authorization', () => {
  let t: TestApp;
  let platformToken: string;
  let platformRefreshToken: string;

  beforeAll(async () => {
    t = await bootTestApp();

    // A platform admin, stored in the platform database.
    const platformDb = t.app.get(DataSource);
    const admins = platformDb.getRepository(PlatformAdmin);
    const admin =
      (await admins.findOne({ where: { email: PLATFORM_ADMIN_EMAIL } })) ??
      (await admins.save(
        admins.create({ email: PLATFORM_ADMIN_EMAIL, fullName: 'Root', isActive: true }),
      ));
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
      body: { email: PLATFORM_ADMIN_EMAIL, password: TEST_PASSWORD },
    });
    expect(login.status).toBeLessThan(300);
    platformToken = login.json.accessToken;
    platformRefreshToken = login.json.refreshToken;
  });

  afterAll(async () => {
    await t?.close();
  });

  describe('authentication is the default', () => {
    it('exposes exactly the expected public routes', () => {
      const publicRoutes = listRoutes(t)
        .filter((r) => r.isPublic)
        .map((r) => `${r.method} ${r.path}`)
        .sort();

      expect(publicRoutes).toEqual([...EXPECTED_PUBLIC_ROUTES].sort());
    });

    it('rejects every other route without a token', async () => {
      const protectedRoutes = listRoutes(t).filter((r) => !r.isPublic);
      expect(protectedRoutes.length).toBeGreaterThan(50);

      const open: string[] = [];
      for (const route of protectedRoutes) {
        const res = await t.request({
          method: route.method,
          url: route.path.replace(/:\w+/g, '00000000-0000-4000-8000-000000000000'),
          tenant: t.alpha.slug,
        });
        if (res.status !== 401) {
          open.push(`${route.method} ${route.path} -> ${res.status}`);
        }
      }

      expect(open).toEqual([]);
    });
  });

  describe('platform administrators (managed with the platform-admin command)', () => {
    const email = `operator${Date.now()}@platform.test`;
    const login = (password: string) =>
      t.request({ method: 'POST', url: '/platform/admin-auth/login', body: { email, password } });
    let admins: PlatformAdminService;

    beforeAll(() => {
      admins = t.app.get(PlatformAdminService);
    });

    it('can sign in once created, and are not created with a weak password or twice', async () => {
      await expect(admins.create(email, 'short')).rejects.toThrow(/at least 12 characters/);

      await admins.create(email.toUpperCase(), 'a first long password', 'Operator');

      expect((await login('a first long password')).status).toBeLessThan(300);
      await expect(admins.create(email, 'another long password')).rejects.toThrow(/already exists/);
    });

    it('lose the old password when a new one is set', async () => {
      await admins.setPassword(email, 'a second long password');

      expect((await login('a first long password')).status).toBe(401);
      expect((await login('a second long password')).status).toBeLessThan(300);
    });

    it('are locked out as soon as they are deactivated, token included', async () => {
      const token = (await login('a second long password')).json.accessToken;
      const listTenants = () => t.request({ method: 'GET', url: '/platform/tenants', token });
      expect((await listTenants()).status).toBe(200);

      await admins.setActive(email, false);

      expect((await listTenants()).status).toBeGreaterThanOrEqual(401);
      expect((await login('a second long password')).status).toBe(401);
    });
  });

  describe('platform administration', () => {
    const listTenants = (token: string, tenant?: string) =>
      t.request({ method: 'GET', url: '/platform/tenants', token, tenant });

    it('is available with a platform admin token', async () => {
      const res = await listTenants(platformToken);

      expect(res.status).toBe(200);
      expect(res.json.map((x: { slug: string }) => x.slug)).toEqual(
        expect.arrayContaining(['alpha', 'beta']),
      );
    });

    it('rejects a tenant admin token', async () => {
      expect((await listTenants(t.alpha.admin.token, t.alpha.slug)).status).toBe(401);
    });

    it('does not let a tenant admin grant the platform admin role', async () => {
      const res = await t.request({
        method: 'PATCH',
        url: `/users/${t.alpha.otherUser.id}`,
        tenant: t.alpha.slug,
        token: t.alpha.admin.token,
        body: { role: 'platform_admin' },
      });

      expect(res.status).toBe(400);
    });

    it('rejects a tenant user who has the same email as a platform admin', async () => {
      const twin = await t.createUser(t.alpha, 'root-twin');
      const token = new JwtService().sign(
        { sub: twin.id, email: PLATFORM_ADMIN_EMAIL, tenantSlug: t.alpha.slug },
        { secret: process.env.JWT_SECRET_KEY, expiresIn: '15m' },
      );

      expect((await listTenants(token, t.alpha.slug)).status).toBe(401);
    });

    it('rejects platform claims signed with the tenant secret', async () => {
      const forged = new JwtService().sign(
        {
          sub: 'anything',
          email: PLATFORM_ADMIN_EMAIL,
          role: 'platform_admin',
          authType: 'platform_admin',
          tokenUse: 'access',
        },
        { secret: process.env.JWT_SECRET_KEY, expiresIn: '15m' },
      );

      expect((await listTenants(forged)).status).toBe(401);
    });

    it('does not let a platform token act as a tenant user', async () => {
      const res = await t.request({
        method: 'GET',
        url: '/auth/profile',
        tenant: t.alpha.slug,
        token: platformToken,
      });

      expect(res.status).toBe(401);
    });

    it('rotates the refresh token on use', async () => {
      const first = await t.request({
        method: 'POST',
        url: '/platform/admin-auth/refresh',
        body: { refreshToken: platformRefreshToken },
      });
      expect(first.status).toBeLessThan(300);
      expect(first.json.refreshToken).not.toBe(platformRefreshToken);

      const replay = await t.request({
        method: 'POST',
        url: '/platform/admin-auth/refresh',
        body: { refreshToken: platformRefreshToken },
      });
      expect(replay.status).toBe(401);
    });
  });

  describe('tenant roles', () => {
    it.each([
      ['GET', '/users'],
      ['GET', '/logs'],
    ] as const)('%s %s is for tenant admins only', async (method, url) => {
      const asUser = await t.request({
        method,
        url,
        tenant: t.alpha.slug,
        token: t.alpha.user.token,
      });
      const asAdmin = await t.request({
        method,
        url,
        tenant: t.alpha.slug,
        token: t.alpha.admin.token,
      });

      expect(asUser.status).toBe(403);
      expect(asAdmin.status).toBe(200);
    });
  });

  describe('tenant binding on the AI upload routes', () => {
    it.each(['/ai/chat/with-images', '/ai/analyze-image'])(
      'POST %s rejects a token from another tenant',
      async (url) => {
        const res = await t.request({
          method: 'POST',
          url,
          tenant: t.beta.slug,
          token: t.alpha.user.token,
        });

        expect(res.status).toBe(401);
      },
    );
  });
});
