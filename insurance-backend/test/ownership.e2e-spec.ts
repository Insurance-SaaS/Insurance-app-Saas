import { Claim } from 'src/modules/claims/entities/claim.entity';
import { bootTestApp, TestApp, TestUser } from './support/test-app';

describe('Resource ownership', () => {
  let t: TestApp;
  let owner: TestUser;
  let stranger: TestUser;
  let admin: TestUser;

  const as = (user: TestUser, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown) =>
    t.request({ method, url, tenant: t.alpha.slug, token: user.token, body });

  beforeAll(async () => {
    t = await bootTestApp();
    owner = await t.createUser(t.alpha, 'owner');
    stranger = await t.createUser(t.alpha, 'stranger');
    admin = t.alpha.admin;
  });

  afterAll(async () => {
    await t?.close();
  });

  describe('claims', () => {
    let claimId: string;

    beforeAll(async () => {
      const claims = (await t.tenantDataSource(t.alpha)).getRepository(Claim);
      const claim = await claims.save(
        claims.create({
          numDossier: `CLM-OWN-${Date.now()}`,
          user: { id: owner.id } as any,
          typeIncidentEn: 'Accident',
          typeIncidentFr: 'Accident',
          typeIncidentAr: 'حادث',
          dateIncident: new Date('2026-01-15'),
          location: 'Alger',
        }),
      );
      claimId = claim.id;
    });

    it('are readable by their owner and by a tenant admin', async () => {
      expect((await as(owner, 'GET', `/claims/${claimId}`)).status).toBe(200);
      expect((await as(admin, 'GET', `/claims/${claimId}`)).status).toBe(200);
    });

    it('look non-existent to another user', async () => {
      const res = await as(stranger, 'GET', `/claims/${claimId}`);

      expect(res.status).toBe(404);
      expect(res.text).not.toContain('CLM-OWN');
    });
  });

  describe('payments', () => {
    let paymentId: string;
    let reference: string;

    beforeAll(async () => {
      const created = await as(owner, 'POST', '/payments', { amount: 1500, method: 'cash' });
      expect(created.status).toBeLessThan(300);
      paymentId = created.json.id;
      reference = created.json.referenceNumber;
      expect(created.json.userId).toBe(owner.id);
    });

    it('cannot be created on behalf of another user', async () => {
      const res = await as(stranger, 'POST', '/payments', {
        userId: owner.id,
        amount: 10,
        method: 'cash',
      });

      expect(res.status).toBe(400);
    });

    it('are readable by their owner and by a tenant admin', async () => {
      expect((await as(owner, 'GET', `/payments/${paymentId}`)).status).toBe(200);
      expect((await as(owner, 'GET', `/payments/reference/${reference}`)).status).toBe(200);
      expect((await as(owner, 'GET', `/payments/user/${owner.id}`)).status).toBe(200);
      expect((await as(admin, 'GET', `/payments/${paymentId}`)).status).toBe(200);
    });

    it('look non-existent to another user, by id, reference or user', async () => {
      expect((await as(stranger, 'GET', `/payments/${paymentId}`)).status).toBe(404);
      expect((await as(stranger, 'GET', `/payments/reference/${reference}`)).status).toBe(404);
      expect((await as(stranger, 'GET', `/payments/user/${owner.id}`)).status).toBe(404);
    });
  });

  describe('ERP account mappings', () => {
    const account = `ACC-${Date.now()}`;

    beforeAll(async () => {
      const created = await as(owner, 'POST', '/erp/mappings', { externalAccountId: account });
      expect(created.status).toBeLessThan(300);
    });

    it('can be read by their owner', async () => {
      expect((await as(owner, 'GET', '/erp/mappings/me')).status).toBe(200);
      expect((await as(owner, 'GET', `/erp/mappings/account/${account}`)).status).toBe(200);
    });

    it('cannot be listed, read, re-linked or deleted by another user', async () => {
      expect((await as(stranger, 'GET', '/erp/mappings')).status).toBe(403);
      expect((await as(stranger, 'GET', `/erp/mappings/account/${account}`)).status).toBe(404);
      expect((await as(stranger, 'GET', `/erp/mappings/user/${owner.id}`)).status).toBe(404);
      expect(
        (await as(stranger, 'PUT', `/erp/mappings/${account}`, { userId: stranger.id })).status,
      ).toBe(403);
      expect((await as(stranger, 'DELETE', `/erp/mappings/${account}`)).status).toBe(404);

      // Still linked to the owner.
      expect((await as(owner, 'GET', '/erp/mappings/me')).json.externalAccountId).toBe(account);
    });

    it('are listed for a tenant admin without password hashes, also from cache', async () => {
      for (let i = 0; i < 2; i++) {
        const res = await as(admin, 'GET', '/erp/mappings');

        expect(res.status).toBe(200);
        expect(res.text).toContain(account);
        expect(res.text).not.toContain('argon2');
      }
    });
  });

  describe('custom field definitions', () => {
    it('can only be managed for the admin\'s own tenant', async () => {
      const own = await as(admin, 'GET', `/platform/tenants/${t.alpha.id}/custom-fields?entityType=claim`);
      const foreign = await as(
        admin,
        'GET',
        `/platform/tenants/${t.beta.id}/custom-fields?entityType=claim`,
      );
      const foreignCreate = await as(admin, 'POST', `/platform/tenants/${t.beta.id}/custom-fields`, {
        entityType: 'claim',
        fieldName: 'injected',
        fieldType: 'string',
        labelEn: 'Injected',
        labelFr: 'Injecté',
        labelAr: 'محقون',
      });

      expect(own.status).toBe(200);
      expect(foreign.status).toBe(404);
      expect(foreignCreate.status).toBe(404);
    });

    it('accept a simple validation pattern but reject one that can backtrack exponentially', async () => {
      const definition = (fieldName: string, pattern: string) => ({
        entityType: 'claim',
        fieldName,
        fieldType: 'string',
        labelEn: 'Plate',
        labelFr: 'Plaque',
        labelAr: 'لوحة',
        validationRules: { pattern },
      });
      const url = `/platform/tenants/${t.alpha.id}/custom-fields`;

      const safe = await as(admin, 'POST', url, definition(`plate_${Date.now()}`, '^[0-9]{5,6}$'));
      const dangerous = await as(admin, 'POST', url, definition('redos', '^(a+)+$'));

      expect(safe.status).toBeLessThan(300);
      expect(dangerous.status).toBe(400);
      expect(dangerous.text).toContain('pattern');
    });
  });
});
