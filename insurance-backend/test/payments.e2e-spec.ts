import { Claim } from 'src/modules/claims/entities/claim.entity';
import { PaymentStatus, PaymentTransaction } from 'src/modules/payment/entities/payment-transaction.entity';
import { bootTestApp, TestApp, TestTenant, TestUser } from './support/test-app';

/** Payment rules, against each tenant (with the default settings: one on each database engine). */
describe.each(['alpha', 'beta'] as const)('Payments of tenant %s', (slug) => {
  let t: TestApp;
  let tenant: TestTenant;
  let payer: TestUser;
  const run = Date.now();

  const call = (as: TestUser, method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown) =>
    t.request({ method, url, tenant: tenant.slug, token: as.token, body });
  const pay = (as: TestUser, body: Record<string, unknown> = {}) =>
    call(as, 'POST', '/payments', { amount: 1500, method: 'cash', ...body });
  const setStatus = (id: string, status: PaymentStatus, as: TestUser = tenant.admin) =>
    call(as, 'PATCH', `/payments/${id}/status`, { status });
  const paymentsOf = async (user: TestUser) =>
    (await t.tenantDataSource(tenant)).getRepository(PaymentTransaction).count({ where: { userId: user.id } });

  beforeAll(async () => {
    t = await bootTestApp();
    tenant = t[slug];
    payer = await t.createUser(tenant, `payer${run}`);
  });

  afterAll(async () => {
    await t?.close();
  });

  describe('a retried request', () => {
    it('returns the first payment instead of creating a second one', async () => {
      const key = `retry-${run}`;

      const first = await pay(payer, { idempotencyKey: key });
      const again = await pay(payer, { idempotencyKey: key });

      expect(first.status).toBeLessThan(300);
      expect(again.status).toBeLessThan(300);
      expect(again.json.id).toBe(first.json.id);
      expect(again.json.referenceNumber).toBe(first.json.referenceNumber);
      expect(await paymentsOf(payer)).toBe(1);
    });

    it('creates one payment even when the copies arrive at the same moment', async () => {
      const user = await t.createUser(tenant, `impatient${run}`);

      const results = await Promise.all(
        Array.from({ length: 5 }, () => pay(user, { idempotencyKey: `double-tap-${run}` })),
      );

      expect(results.map((r) => r.status).filter((s) => s >= 300)).toEqual([]);
      expect(new Set(results.map((r) => r.json.id)).size).toBe(1);
      expect(await paymentsOf(user)).toBe(1);
    });

    it('does not mix up two users who chose the same key', async () => {
      const other = await t.createUser(tenant, `otherpayer${run}`);
      const key = `shared-${run}`;

      const mine = await pay(payer, { idempotencyKey: key });
      const theirs = await pay(other, { idempotencyKey: key });

      expect(theirs.status).toBeLessThan(300);
      expect(theirs.json.id).not.toBe(mine.json.id);
      expect(theirs.json.userId).toBe(other.id);
    });

    it('is a new payment when no key is sent', async () => {
      const user = await t.createUser(tenant, `nokey${run}`);

      const first = await pay(user);
      const second = await pay(user);

      expect(second.status).toBeLessThan(300);
      expect(second.json.id).not.toBe(first.json.id);
      expect(await paymentsOf(user)).toBe(2);
    });

    it('does not show the stored key in responses', async () => {
      const res = await pay(payer, { idempotencyKey: `hidden-${run}` });

      expect(res.json).not.toHaveProperty('idempotencyKey');
    });
  });

  describe('what a payment is for', () => {
    const MISSING = '7b0c7c5e-3f0e-4c58-9d7b-0f6d5b0a4c11';
    const claimOf = async (owner: TestUser) => {
      const claims = (await t.tenantDataSource(tenant)).getRepository(Claim);
      const claim = await claims.save(
        claims.create({
          numDossier: `CLM-PAY-${owner.id.slice(0, 8)}-${Date.now()}`,
          user: { id: owner.id } as any,
          typeIncidentEn: 'Accident',
          typeIncidentFr: 'Accident',
          typeIncidentAr: 'حادث',
          dateIncident: new Date('2026-01-15'),
          location: 'Alger',
        }),
      );
      return claim.id;
    };

    it('may be one of the payer\'s claims', async () => {
      const res = await pay(payer, { claimId: await claimOf(payer) });

      expect(res.status).toBeLessThan(300);
    });

    it('may not be a claim of someone else, and the answer does not reveal that it exists', async () => {
      const theirs = await pay(payer, { claimId: await claimOf(tenant.otherUser) });
      const missing = await pay(payer, { claimId: MISSING });

      expect(theirs.status).toBe(400);
      expect(theirs.json.message).toBe(missing.json.message);
    });

    it('may not be a quote that does not exist', async () => {
      const res = await pay(payer, { quoteId: MISSING });

      expect(res.status).toBe(400);
      expect(res.json.message).toMatch(/quote/);
    });
  });

  describe('the status of a payment', () => {
    const newPayment = async () => (await pay(payer)).json.id as string;

    it('starts as pending and can only be changed by an admin', async () => {
      const created = await pay(payer);

      expect(created.json.status).toBe(PaymentStatus.PENDING);
      expect((await setStatus(created.json.id, PaymentStatus.COMPLETED, payer)).status).toBe(403);
    });

    it('records when the payment was completed', async () => {
      const id = await newPayment();

      const res = await setStatus(id, PaymentStatus.COMPLETED);

      expect(res.status).toBe(200);
      expect(res.json.status).toBe(PaymentStatus.COMPLETED);
      expect(new Date(res.json.paidAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    });

    it('never goes backwards', async () => {
      const id = await newPayment();
      await setStatus(id, PaymentStatus.COMPLETED);

      const res = await setStatus(id, PaymentStatus.PENDING);

      expect(res.status).toBe(400);
      expect(res.json.message).toMatch(/completed payment cannot become pending/);
    });

    it('allows a completed payment to be refunded, once', async () => {
      const id = await newPayment();
      await setStatus(id, PaymentStatus.COMPLETED);

      expect((await setStatus(id, PaymentStatus.REFUNDED)).status).toBe(200);
      expect((await setStatus(id, PaymentStatus.COMPLETED)).status).toBe(400);
    });

    it.each([PaymentStatus.FAILED, PaymentStatus.CANCELLED])('is final once %s', async (final) => {
      const id = await newPayment();
      expect((await setStatus(id, final)).status).toBe(200);

      for (const next of [PaymentStatus.PROCESSING, PaymentStatus.COMPLETED, PaymentStatus.REFUNDED]) {
        expect((await setStatus(id, next)).status).toBe(400);
      }
    });
  });

  describe('lists', () => {
    it('are served in pages', async () => {
      const user = await t.createUser(tenant, `frequent${run}`);
      for (let i = 0; i < 3; i++) await pay(user);

      const firstPage = await call(user, 'GET', `/payments/user/${user.id}?limit=2`);
      const secondPage = await call(user, 'GET', `/payments/user/${user.id}?limit=2&page=2`);
      const all = await call(tenant.admin, 'GET', '/payments?limit=1');

      expect(firstPage.json).toHaveLength(2);
      expect(secondPage.json).toHaveLength(1);
      expect(all.json).toHaveLength(1);
      expect((await call(tenant.admin, 'GET', '/payments?limit=5000')).status).toBe(400);
    });
  });
});
