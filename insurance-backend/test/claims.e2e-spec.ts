import { Claim, ClaimStatus } from 'src/modules/claims/entities/claim.entity';
import { Document } from 'src/modules/claims/entities/document.entity';
import { FormFile, JPEG, multipartForm, PDF } from './support/multipart';
import { bootTestApp, TestApp, TestTenant, TestUser } from './support/test-app';

/**
 * Declaring a claim over HTTP, against each tenant (with the default settings:
 * one on each database engine).
 */
describe.each(['alpha', 'beta'] as const)('Claims of tenant %s', (slug) => {
  let t: TestApp;
  let tenant: TestTenant;
  let user: TestUser;
  const run = Date.now();

  const photo: FormFile = { field: 'files', name: 'degats.jpg', type: 'image/jpeg', content: JPEG };
  const report: FormFile = { field: 'documents', name: 'constat.pdf', type: 'application/pdf', content: PDF };
  const form = { typeIncident: 'Accident', dateIncident: '2025-09-27', location: 'Alger' };

  const declare = (
    fields: Record<string, string | string[]>,
    files: FormFile[] = [],
    as: TestUser = user,
  ) =>
    t.request({
      method: 'POST',
      url: '/claims/declare',
      tenant: tenant.slug,
      token: as.token,
      ...multipartForm(fields, files),
    });
  const get = (url: string, as: TestUser = user) =>
    t.request({ method: 'GET', url, tenant: tenant.slug, token: as.token });
  const claims = async () => (await t.tenantDataSource(tenant)).getRepository(Claim);
  const claimsOf = async (owner: TestUser) => (await claims()).count({ where: { user: { id: owner.id } } });

  beforeAll(async () => {
    t = await bootTestApp();
    tenant = t[slug];
    user = await t.createUser(tenant, `claimant${run}`);
  });

  afterAll(async () => {
    await t?.close();
  });

  describe('a declaration with documents', () => {
    let claim: any;

    beforeAll(async () => {
      const res = await declare(
        {
          ...form,
          timeIncident: '13:59',
          description: 'تصادم في الطريق السريع',
          partsEndommagees: '["Capot","Phares"]',
          rayures: ['Portière gauche', 'Aile'],
          bosses: 'Capot',
        },
        [photo, report],
      );
      expect(res.status).toBeLessThan(300);
      claim = res.json.data;
    });

    it('returns the reference number and what was declared', () => {
      expect(claim.numDossier).toMatch(/^CLM/);
      expect(claim).toMatchObject({
        status: ClaimStatus.SUBMITTED,
        typeIncident: 'Accident',
        dateIncident: '2025-09-27',
        timeIncident: '13:59',
        location: 'Alger',
        description: 'تصادم في الطريق السريع',
      });
    });

    it('keeps the damage detail, however the form sent each list', async () => {
      const read = await get(`/claims/${claim.id}`);

      expect(read.status).toBe(200);
      expect(read.json.data).toMatchObject({
        partsEndommagees: ['Capot', 'Phares'],
        rayures: ['Portière gauche', 'Aile'],
        bosses: ['Capot'],
        dommagesPoignee: [],
      });
    });

    it('stores each document and hands out expiring links, not storage locations', async () => {
      const stored = await (await t.tenantDataSource(tenant))
        .getRepository(Document)
        .find({ where: { claim: { id: claim.id } } });

      expect(stored.map((d) => d.contentType).sort()).toEqual(['application/pdf', 'image/jpeg']);
      for (const document of stored) {
        expect(t.storage.objects.has(document.fileUrl)).toBe(true);
        // Stored under the tenant, so one tenant can never be given another's files.
        expect(document.fileUrl).toContain(`/${tenant.slug}/`);
      }

      const read = await get(`/claims/${claim.id}`);
      expect(claim.documents).toHaveLength(2);
      for (const document of [...claim.documents, ...read.json.data.documents]) {
        expect(document.fileUrl).toMatch(/\?signed=1$/);
      }
    });

    it('removes the stored files when an admin deletes the claim', async () => {
      const extra = await declare(form, [photo]);
      const id = extra.json.data.id;
      const [document] = await (await t.tenantDataSource(tenant))
        .getRepository(Document)
        .find({ where: { claim: { id } } });

      const res = await t.request({
        method: 'DELETE',
        url: `/claims/${id}`,
        tenant: tenant.slug,
        token: tenant.admin.token,
      });

      expect(res.status).toBe(204);
      expect(t.storage.objects.has(document.fileUrl)).toBe(false);
      expect((await get(`/claims/${id}`)).status).toBe(404);
    });
  });

  describe('a declaration that cannot be accepted', () => {
    it.each([
      ['a missing incident type', { ...form, typeIncident: '' }, /typeIncident/],
      ['a date that is not a date', { ...form, dateIncident: 'hier' }, /dateIncident/],
      ['a list that is not a list', { ...form, rayures: '["Capot"' }, /rayures/],
      ['custom fields that are not an object', { ...form, customFields: '[1,2]' }, /customFields/],
    ])('is refused for %s, with the field named', async (_case, fields, message) => {
      const before = await claimsOf(user);

      const res = await declare(fields);

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.json.message)).toMatch(message);
      expect(await claimsOf(user)).toBe(before);
    });

    it('is refused for an incident dated in the future', async () => {
      const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);

      const res = await declare({ ...form, dateIncident: future });

      expect(res.status).toBe(400);
      expect(res.json.message).toMatch(/future/i);
    });

    it('is refused when a "document" is not a picture or a PDF', async () => {
      const before = await claimsOf(user);
      const script: FormFile = {
        field: 'files',
        name: 'constat.pdf',
        type: 'application/pdf',
        content: Buffer.from('<?php system($_GET["c"]); ?>'),
      };

      const res = await declare(form, [script]);

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(await claimsOf(user)).toBe(before);
    });

    it('is not thrown off by form fields named after object internals', async () => {
      const res = await declare({ ...form, constructor: 'x', toString: 'y', hasOwnProperty: 'z' });

      // Refused as malformed or accepted with the fields ignored: never a server error.
      expect(res.status).toBeLessThan(500);
    });

    it('ignores a status or an owner slipped into the form', async () => {
      const res = await declare({ ...form, status: ClaimStatus.APPROVED, userId: tenant.otherUser.id });

      expect(res.status).toBeLessThan(300);
      expect(res.json.data.status).toBe(ClaimStatus.SUBMITTED);
      const saved = await (await claims()).findOne({ where: { id: res.json.data.id }, relations: ['user'] });
      expect(saved!.user.id).toBe(user.id);
    });
  });

  describe('when file storage fails half-way', () => {
    afterEach(() => {
      t.storage.uploadsBeforeFailure = undefined;
    });

    it('saves nothing at all and says the service is unavailable', async () => {
      const claimant = await t.createUser(tenant, `unlucky${run}`);
      const objectsBefore = t.storage.objects.size;
      t.storage.uploadsBeforeFailure = 1; // the first file is stored, the second fails

      const res = await declare(form, [photo, report], claimant);

      expect(res.status).toBe(503);
      expect(await claimsOf(claimant)).toBe(0);
      // The file that did get stored is removed again.
      expect(t.storage.objects.size).toBe(objectsBefore);
    });
  });

  describe('the list of my claims', () => {
    let lister: TestUser;
    const list = (query = '') => get(`/claims/my-claims${query}`, lister);

    beforeAll(async () => {
      lister = await t.createUser(tenant, `lister${run}`);
      for (const typeIncident of ['Vol', 'Feu', 'Accident']) {
        expect((await declare({ ...form, typeIncident }, [], lister)).status).toBeLessThan(300);
      }
    });

    it('returns only the caller\'s claims, newest first', async () => {
      const res = await list();

      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({ success: true, total: 3, page: 1, limit: 50 });
      expect(res.json.data.map((c: any) => c.typeIncident)).toEqual(['Accident', 'Feu', 'Vol']);
    });

    it('is served in pages, with the total across all pages', async () => {
      const first = await list('?limit=2');
      const second = await list('?limit=2&page=2&lang=fr');

      expect(first.json).toMatchObject({ total: 3, page: 1, limit: 2 });
      expect(first.json.data).toHaveLength(2);
      expect(second.json).toMatchObject({ total: 3, page: 2, limit: 2 });
      expect(second.json.data.map((c: any) => c.typeIncident)).toEqual(['Vol']);
    });

    it('refuses a page size that would return everything at once', async () => {
      expect((await list('?limit=100000')).status).toBe(400);
      expect((await list('?page=0')).status).toBe(400);
    });
  });

  describe('reading and updating one claim', () => {
    let claimId: string;

    beforeAll(async () => {
      claimId = (await declare(form)).json.data.id;
    });

    it('answers 400, not a server error, for an id that is not an id', async () => {
      expect((await get('/claims/not-a-uuid')).status).toBe(400);
    });

    it('keeps the proper status code when a user tries an admin action', async () => {
      const res = await t.request({
        method: 'PATCH',
        url: `/claims/${claimId}/status`,
        tenant: tenant.slug,
        token: user.token,
        body: { status: ClaimStatus.APPROVED },
      });

      expect(res.status).toBe(403);
    });

    it('lets an admin change the status and shows it to the owner', async () => {
      const res = await t.request({
        method: 'PATCH',
        url: `/claims/${claimId}/status`,
        tenant: tenant.slug,
        token: tenant.admin.token,
        body: { status: ClaimStatus.APPROVED },
      });

      expect(res.status).toBe(200);
      expect((await get(`/claims/${claimId}`)).json.data.status).toBe(ClaimStatus.APPROVED);
    });
  });
});
