import { RedisService } from 'src/cache_storage/services/redis.service';
import { bootTestApp, TestApp, TEST_PASSWORD } from './support/test-app';

describe('Application smoke test', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await bootTestApp();
  });

  afterAll(async () => {
    await t?.close();
  });

  it('answers the health check', async () => {
    const res = await t.request({ method: 'GET', url: '/health', raw: true });

    expect(res.status).toBe(200);
    expect(res.json.status).toBe('ok');
  });

  describe('readiness', () => {
    it('reports ready when the platform database and Redis answer', async () => {
      const res = await t.request({ method: 'GET', url: '/health/ready', raw: true });

      expect(res.status).toBe(200);
      expect(res.json).toEqual({ status: 'ok', checks: { database: 'ok', redis: 'ok' } });
    });

    it('answers 503 when a dependency is down, without saying why', async () => {
      const client = t.app.get(RedisService).getClient();
      const ping = jest
        .spyOn(client, 'ping')
        .mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.12:6379'));
      try {
        const res = await t.request({ method: 'GET', url: '/health/ready', raw: true });

        expect(res.status).toBe(503);
        expect(res.json).toEqual({ status: 'unavailable', checks: { database: 'ok', redis: 'failed' } });
        expect(res.text).not.toContain('10.0.0.12');
      } finally {
        ping.mockRestore();
      }
    });
  });

  it('runs without the optional integrations, and says so when one is asked for', async () => {
    // The test environment configures no Google sign-in, as a fresh deployment would not.
    const res = await t.request({ method: 'GET', url: '/auth/google', tenant: t.alpha.slug });

    expect(res.status).toBe(503);
    expect(res.json.message).toBe('Google sign-in is not configured');
  });

  it('logs a tenant user in with email and password', async () => {
    const res = await t.request({
      method: 'POST',
      url: '/auth/login',
      tenant: t.alpha.slug,
      body: { email: t.alpha.user.email, password: TEST_PASSWORD },
    });

    expect(res.status).toBeLessThan(300);
    expect(typeof res.json.accessToken).toBe('string');
    expect(typeof res.json.refreshToken).toBe('string');
  });

  it('rejects a wrong password', async () => {
    const res = await t.request({
      method: 'POST',
      url: '/auth/login',
      tenant: t.alpha.slug,
      body: { email: t.alpha.user.email, password: 'not-the-password' },
    });

    expect(res.status).toBe(401);
  });

  it('returns the profile of the authenticated user', async () => {
    const res = await t.request({
      method: 'GET',
      url: '/auth/profile',
      tenant: t.alpha.slug,
      token: t.alpha.user.token,
    });

    expect(res.status).toBe(200);
    expect(res.text).toContain(t.alpha.user.email);
  });

  it('rejects a protected route without a token', async () => {
    const res = await t.request({ method: 'GET', url: '/auth/profile', tenant: t.alpha.slug });

    expect(res.status).toBe(401);
  });

  it('rejects a token issued for another tenant', async () => {
    const res = await t.request({
      method: 'GET',
      url: '/auth/profile',
      tenant: t.beta.slug,
      token: t.alpha.user.token,
    });

    expect(res.status).toBe(401);
  });

  it('returns 404 for an unknown tenant', async () => {
    const res = await t.request({
      method: 'GET',
      url: '/auth/profile',
      tenant: 'does-not-exist',
      token: t.alpha.user.token,
    });

    expect(res.status).toBe(404);
  });
});
