import { RedisService } from 'src/cache_storage/services/redis.service';
import { RedisThrottlerStorage } from 'src/shared/throttling/redis-throttler.storage';
import { bootTestApp, TestApp, TEST_PASSWORD } from './support/test-app';

function multipart(fieldName: string, fileName: string, contentType: string, content: Buffer) {
  const boundary = '----integration-test-boundary';
  const head =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`;
  return {
    payload: Buffer.concat([Buffer.from(head), content, Buffer.from(`\r\n--${boundary}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('HTTP hardening', () => {
  let t: TestApp;
  const previousCorsOrigins = process.env.CORS_ORIGINS;

  beforeAll(async () => {
    process.env.CORS_ORIGINS = 'https://admin.example.com';
    t = await bootTestApp();
  });

  afterAll(async () => {
    await t?.close();
    if (previousCorsOrigins === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = previousCorsOrigins;
  });

  it('keeps the health check free of runtime details', async () => {
    const res = await t.request({ method: 'GET', url: '/health', raw: true });

    expect(res.status).toBe(200);
    expect(Object.keys(res.json).sort()).toEqual(['status', 'timestamp']);
  });

  it('sends security headers', async () => {
    const res = await t.request({ method: 'GET', url: '/tenant/config', tenant: t.alpha.slug });

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('only answers CORS for configured origins', async () => {
    const from = (origin: string) =>
      t.request({
        method: 'GET',
        url: '/tenant/config',
        tenant: t.alpha.slug,
        headers: { origin },
      });

    expect((await from('https://admin.example.com')).headers['access-control-allow-origin']).toBe(
      'https://admin.example.com',
    );
    expect(
      (await from('https://evil.example.org')).headers['access-control-allow-origin'],
    ).toBeUndefined();
  });

  it('rejects oversized JSON bodies', async () => {
    const res = await t.request({
      method: 'POST',
      url: '/auth/login',
      tenant: t.alpha.slug,
      body: { email: t.alpha.user.email, password: 'x'.repeat(2 * 1024 * 1024) },
    });

    expect(res.status).toBe(413);
  });

  it('still accepts a file upload larger than the JSON limit', async () => {
    const jpeg = Buffer.concat([
      Buffer.from('ffd8ffe000104a46494600', 'hex'),
      Buffer.alloc(2 * 1024 * 1024, 7),
    ]);
    const file = multipart('file', 'photo.jpg', 'image/jpeg', jpeg);

    const res = await t.request({
      method: 'PATCH',
      url: '/auth/upload-profile-picture',
      tenant: t.alpha.slug,
      token: t.alpha.user.token,
      ...file,
    });

    expect(res.status).toBe(200);
    expect(t.storage.objects.size).toBe(1);
  });

  it('rejects an upload whose content is not an image, whatever its name says', async () => {
    const script = multipart('file', 'photo.jpg', 'image/jpeg', Buffer.from('<?php system($_GET["c"]); ?>'));

    const res = await t.request({
      method: 'PATCH',
      url: '/auth/upload-profile-picture',
      tenant: t.alpha.slug,
      token: t.alpha.user.token,
      ...script,
    });

    expect(res.status).toBe(400);
    expect(t.storage.objects.size).toBe(1); // nothing new was stored
  });
});

describe('Rate limiting', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await bootTestApp({ throttling: true });
  });

  afterAll(async () => {
    await t?.close();
  });

  it('limits repeated login attempts', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await t.request({
        method: 'POST',
        url: '/auth/login',
        tenant: t.alpha.slug,
        body: { email: t.alpha.user.email, password: i === 0 ? TEST_PASSWORD : 'Wrong1Password' },
      });
      statuses.push(res.status);
    }

    expect(statuses[0]).toBeLessThan(300);
    expect(statuses).toContain(429);
  });

  it('counts in Redis, so every instance of the API enforces the same total', async () => {
    const redis = t.app.get(RedisService);
    // Two stores on one Redis, as two instances of the API would be.
    const instanceA = new RedisThrottlerStorage(redis);
    const instanceB = new RedisThrottlerStorage(redis);
    const hit = (instance: RedisThrottlerStorage) =>
      instance.increment(`client-${Date.now()}`.slice(0, 16), 60_000, 2, 60_000, 'test');
    const key = `shared-${Date.now()}`;
    const hitShared = (instance: RedisThrottlerStorage) =>
      instance.increment(key, 60_000, 2, 60_000, 'test');

    expect(await hitShared(instanceA)).toMatchObject({ totalHits: 1, isBlocked: false });
    expect(await hitShared(instanceB)).toMatchObject({ totalHits: 2, isBlocked: false, timeToExpire: 60 });
    expect(await hitShared(instanceA)).toMatchObject({ isBlocked: true, timeToBlockExpire: 60 });
    expect((await hitShared(instanceB)).isBlocked).toBe(true);
    // Another client is not affected.
    expect((await hit(instanceB)).isBlocked).toBe(false);
  });
});
