import { ConfigService } from '@nestjs/config';
import { bootTestApp, TestApp, TestUser, TEST_PASSWORD } from './support/test-app';

const NEW_PASSWORD = 'Another1Password';

describe('Authentication security', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await bootTestApp();
  });

  afterAll(async () => {
    await t?.close();
  });

  const login = (email: string, password: string) =>
    t.request({
      method: 'POST',
      url: '/auth/login',
      tenant: t.alpha.slug,
      body: { email, password },
    });

  describe('password reset', () => {
    let victim: TestUser;

    beforeAll(async () => {
      victim = await t.createUser(t.alpha, 'reset-victim');
    });

    it('cannot be done with only an email and a new password', async () => {
      const res = await t.request({
        method: 'PATCH',
        url: '/auth/reset-password',
        tenant: t.alpha.slug,
        body: { email: victim.email, newPassword: NEW_PASSWORD },
      });

      expect(res.status).toBe(400);
      expect((await login(victim.email, TEST_PASSWORD)).status).toBeLessThan(300);
      expect((await login(victim.email, NEW_PASSWORD)).status).toBe(401);
    });

    it('rejects a reset token that was never issued', async () => {
      const res = await t.request({
        method: 'PATCH',
        url: '/auth/reset-password',
        tenant: t.alpha.slug,
        body: { email: victim.email, resetToken: 'a'.repeat(64), newPassword: NEW_PASSWORD },
      });

      expect(res.status).toBe(400);
      expect((await login(victim.email, NEW_PASSWORD)).status).toBe(401);
    });

    it('answers the same for known and unknown emails', async () => {
      const known = await t.request({
        method: 'POST',
        url: '/auth/reset-password-otp',
        tenant: t.alpha.slug,
        body: { email: victim.email },
      });
      const unknown = await t.request({
        method: 'POST',
        url: '/auth/reset-password-otp',
        tenant: t.alpha.slug,
        body: { email: 'nobody@alpha.test' },
      });

      expect(unknown.status).toBe(known.status);
      expect(unknown.json).toEqual(known.json);
    });

    it('works with the OTP and the single-use reset token, and signs other sessions out', async () => {
      const session = await login(victim.email, TEST_PASSWORD);
      const oldRefreshToken = session.json.refreshToken;

      await t.request({
        method: 'POST',
        url: '/auth/reset-password-otp',
        tenant: t.alpha.slug,
        body: { email: victim.email },
      });
      const otp = await t.readOtp(t.alpha, 'password-reset', victim.email);

      const verified = await t.request({
        method: 'POST',
        url: '/auth/verify-otp-reset',
        tenant: t.alpha.slug,
        body: { email: victim.email, otpEmail: otp },
      });
      expect(verified.status).toBeLessThan(300);
      const resetToken: string = verified.json.resetToken;
      expect(resetToken).toMatch(/^[0-9a-f]{64}$/);

      const reset = await t.request({
        method: 'PATCH',
        url: '/auth/reset-password',
        tenant: t.alpha.slug,
        body: { email: victim.email, resetToken, newPassword: NEW_PASSWORD },
      });
      expect(reset.status).toBe(200);

      expect((await login(victim.email, NEW_PASSWORD)).status).toBeLessThan(300);
      expect((await login(victim.email, TEST_PASSWORD)).status).toBe(401);

      // The token is single use.
      const replay = await t.request({
        method: 'PATCH',
        url: '/auth/reset-password',
        tenant: t.alpha.slug,
        body: { email: victim.email, resetToken, newPassword: 'Third1Password' },
      });
      expect(replay.status).toBe(400);

      // The session opened before the reset can no longer be refreshed.
      const refresh = await t.request({
        method: 'POST',
        url: '/auth/refresh',
        tenant: t.alpha.slug,
        body: { refreshToken: oldRefreshToken },
      });
      expect(refresh.status).toBe(401);
    });

    it('throws the OTP away after five wrong guesses', async () => {
      const target = await t.createUser(t.alpha, 'otp-bruteforce');
      await t.request({
        method: 'POST',
        url: '/auth/reset-password-otp',
        tenant: t.alpha.slug,
        body: { email: target.email },
      });
      const otp = await t.readOtp(t.alpha, 'password-reset', target.email);
      const wrong = otp === 111111 ? 222222 : 111111;

      for (let i = 0; i < 5; i++) {
        const res = await t.request({
          method: 'POST',
          url: '/auth/verify-otp-reset',
          tenant: t.alpha.slug,
          body: { email: target.email, otpEmail: wrong },
        });
        expect(res.status).toBe(400);
      }

      const afterLockout = await t.request({
        method: 'POST',
        url: '/auth/verify-otp-reset',
        tenant: t.alpha.slug,
        body: { email: target.email, otpEmail: otp },
      });
      expect(afterLockout.status).toBe(400);
    });
  });

  describe('Google sign-in from the mobile app', () => {
    const login = (idToken: string) =>
      t.request({
        method: 'POST',
        url: '/auth/google/mobile',
        tenant: t.alpha.slug,
        body: { idToken },
      });
    const forged = `${'a'.repeat(20)}.${'b'.repeat(20)}.${'c'.repeat(20)}`;

    it('says so when the server has no Google client id', async () => {
      const res = await login(forged);

      expect(res.status).toBe(503);
      expect(res.json.message).toBe('Google sign-in is not configured');
    });

    it('answers 401 to a token Google did not issue, without the verifier\'s error text', async () => {
      process.env.GOOGLE_ANDROID_CLIENT_ID = 'test-android-client';
      const config = t.app.get(ConfigService);
      const get = jest
        .spyOn(config, 'get')
        .mockImplementation((key: string) =>
          key === 'GOOGLE_ANDROID_CLIENT_ID' ? 'test-android-client' : undefined,
        );
      try {
        const res = await login(forged);

        expect(res.status).toBe(401);
        expect(res.json.message).toBe('Invalid Google ID token');
      } finally {
        get.mockRestore();
        delete process.env.GOOGLE_ANDROID_CLIENT_ID;
      }
    });
  });

  describe('signup', () => {
    const signup = (email: string, phone: string) =>
      t.request({
        method: 'POST',
        url: '/auth/signup',
        tenant: t.alpha.slug,
        body: { email, phone, password: TEST_PASSWORD, username: 'new-user' },
      });

    it('answers "try again later", not "bad request", when the code cannot be sent', async () => {
      t.outbox.failing = true;
      try {
        const res = await signup('undelivered@alpha.test', '+213661000077');

        expect(res.status).toBe(503);
        expect(res.json.message).toMatch(/could not be sent/);
        // The cause is for the log, not for the client.
        expect(res.text).not.toContain('ECONNREFUSED');
      } finally {
        t.outbox.failing = false;
      }
    });

    it('does not create the account until the email OTP was verified', async () => {
      const email = 'unverified@alpha.test';
      expect((await signup(email, '+213661000001')).status).toBeLessThan(300);

      const res = await t.request({
        method: 'POST',
        url: '/auth/verify-otp',
        tenant: t.alpha.slug,
        body: { email },
      });

      expect(res.status).toBe(400);
      expect((await login(email, TEST_PASSWORD)).status).toBe(401);
    });

    it('creates the account after the email OTP, without returning the password', async () => {
      const email = 'verified@alpha.test';
      await signup(email, '+213661000002');
      const otp = await t.readOtp(t.alpha, 'signup-email', email);

      const verifyEmail = await t.request({
        method: 'POST',
        url: '/auth/verify-otp-email',
        tenant: t.alpha.slug,
        body: { email, otpEmail: otp },
      });
      expect(verifyEmail.status).toBeLessThan(300);

      const created = await t.request({
        method: 'POST',
        url: '/auth/verify-otp',
        tenant: t.alpha.slug,
        body: { email },
      });

      expect(created.status).toBeLessThan(300);
      expect(typeof created.json.accessToken).toBe('string');
      expect(created.text).not.toContain('argon2');
      expect(created.json.user.password).toBeUndefined();
      expect((await login(email, TEST_PASSWORD)).status).toBeLessThan(300);
    });

    it('answers the same when the email is already registered', async () => {
      const fresh = await signup('fresh@alpha.test', '+213661000003');
      const existing = await signup(t.alpha.user.email, '+213661000004');

      expect(existing.status).toBe(fresh.status);
      expect(existing.json).toEqual(fresh.json);
    });
  });

  describe('password hashes', () => {
    it('are not returned by login', async () => {
      const res = await login(t.alpha.user.email, TEST_PASSWORD);

      expect(res.status).toBeLessThan(300);
      expect(res.text).not.toContain('argon2');
      expect(res.json.user.password).toBeUndefined();
    });

    it('are not returned by the admin user list, including when served from cache', async () => {
      for (let i = 0; i < 2; i++) {
        const res = await t.request({
          method: 'GET',
          url: '/users',
          tenant: t.alpha.slug,
          token: t.alpha.admin.token,
        });

        expect(res.status).toBe(200);
        expect(res.text).toContain(t.alpha.user.email);
        expect(res.text).not.toContain('argon2');
      }
    });
  });

  describe('profile changes', () => {
    it('cannot set a password through update-profile', async () => {
      const res = await t.request({
        method: 'PATCH',
        url: '/auth/update-profile',
        tenant: t.alpha.slug,
        token: t.alpha.user.token,
        body: { password: NEW_PASSWORD },
      });

      expect(res.status).toBe(400);
      expect((await login(t.alpha.user.email, TEST_PASSWORD)).status).toBeLessThan(300);
    });

    it('requires an OTP sent to the new number before changing the phone', async () => {
      const user = await t.createUser(t.alpha, 'phone-changer');
      const phone = '+213661000009';

      const withoutOtp = await t.request({
        method: 'PATCH',
        url: '/auth/update-profile',
        tenant: t.alpha.slug,
        token: user.token,
        body: { phone },
      });
      expect(withoutOtp.status).toBe(400);

      const sent = await t.request({
        method: 'POST',
        url: '/auth/send-otp-phone-change',
        tenant: t.alpha.slug,
        token: user.token,
        body: { phone },
      });
      expect(sent.status).toBeLessThan(300);
      const otp = await t.readOtp(t.alpha, 'phone-change', `${user.id}:${phone}`);

      const withOtp = await t.request({
        method: 'PATCH',
        url: '/auth/update-profile',
        tenant: t.alpha.slug,
        token: user.token,
        body: { phone, otpSms: otp },
      });
      expect(withOtp.status).toBe(200);
      expect(withOtp.json.updatedUser.phone).toBe(phone);
      expect(withOtp.text).not.toContain('argon2');
    });

    it('changes the password only with the current one, and replaces the session', async () => {
      const user = await t.createUser(t.alpha, 'password-changer');
      const session = await login(user.email, TEST_PASSWORD);

      const wrongOld = await t.request({
        method: 'PATCH',
        url: '/auth/change-password',
        tenant: t.alpha.slug,
        token: user.token,
        body: { oldPassword: 'Wrong1Password', newPassword: NEW_PASSWORD },
      });
      expect(wrongOld.status).toBe(401);

      const changed = await t.request({
        method: 'PATCH',
        url: '/auth/change-password',
        tenant: t.alpha.slug,
        token: user.token,
        body: { oldPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD },
      });
      expect(changed.status).toBe(200);
      expect(typeof changed.json.refreshToken).toBe('string');

      const oldSession = await t.request({
        method: 'POST',
        url: '/auth/refresh',
        tenant: t.alpha.slug,
        body: { refreshToken: session.json.refreshToken },
      });
      expect(oldSession.status).toBe(401);
      expect((await login(user.email, NEW_PASSWORD)).status).toBeLessThan(300);
    });
  });
});
