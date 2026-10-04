import { Claim } from 'src/modules/claims/entities/claim.entity';
import { LlmError } from 'src/modules/ai/openai-client.service';
import { TenantService } from 'src/core/tenant/tenant.service';
import { bootTestApp, TestApp, TestUser } from './support/test-app';

const JPEG = Buffer.concat([Buffer.from('ffd8ffe000104a46494600', 'hex'), Buffer.alloc(2048, 1)]);

function multipart(fields: Record<string, string>, files: { name: string; content: Buffer }[]) {
  const boundary = '----ai-test-boundary';
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`),
    );
  }
  for (const file of files) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="${file.name}"\r\n` +
          'Content-Type: application/octet-stream\r\n\r\n',
      ),
      file.content,
      Buffer.from('\r\n'),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('AI assistant', () => {
  let t: TestApp;
  let user: TestUser;

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const chat = (as: TestUser, body: Record<string, unknown>) =>
    t.request({ method: 'POST', url: '/ai/chat', tenant: t.alpha.slug, token: as.token, body });
  const chatWithImages = (as: TestUser, fields: Record<string, string>, files: { name: string; content: Buffer }[]) =>
    t.request({
      method: 'POST',
      url: '/ai/chat/with-images',
      tenant: t.alpha.slug,
      token: as.token,
      ...multipart(fields, files),
    });
  const claimsOf = async (owner: TestUser) =>
    (await t.tenantDataSource(t.alpha)).getRepository(Claim).find({
      where: { user: { id: owner.id } },
      relations: ['documents'],
    });

  /** Drives a claim declaration up to the point where the assistant asks for confirmation. */
  async function declareUpToConfirmation(as: TestUser): Promise<string> {
    t.llm.conversationType = 'sinistre_auto';
    t.llm.extract = (message) =>
      message.includes('accident')
        ? {
            typeSinistre: 'accident',
            dateSinistre: yesterday,
            heureSinistre: '14:30',
            lieuSinistre: 'Alger',
            descriptionIncident: 'Collision arrière au feu rouge avec un autre véhicule',
          }
        : {};

    const first = await chat(as, { message: "Bonjour, j'ai eu un accident de voiture hier à Alger" });
    expect(first.status).toBeLessThan(300);
    expect(first.json.conversationType).toBe('sinistre_auto');
    expect(first.json.missingInformation).toEqual(expect.arrayContaining(['photos']));

    const withPhoto = await chatWithImages(
      as,
      { message: 'Voici la photo', sessionId: first.json.sessionId },
      [{ name: 'degats.jpg', content: JPEG }],
    );
    expect(withPhoto.status).toBeLessThan(300);
    expect(withPhoto.json.missingInformation).toEqual([]);
    return first.json.sessionId;
  }

  beforeAll(async () => {
    t = await bootTestApp();
  });

  afterAll(async () => {
    await t?.close();
  });

  beforeEach(async () => {
    user = await t.createUser(t.alpha, `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    t.storage.failDownloads = false;
  });

  describe('a claim declaration', () => {
    it('is filed exactly once, with its photo, and a follow-up message starts a new conversation', async () => {
      const sessionId = await declareUpToConfirmation(user);
      expect(sessionId).toMatch(/^[0-9a-f-]{36}$/); // issued by the server

      const confirmed = await chat(user, { message: 'oui', sessionId });
      expect(confirmed.status).toBeLessThan(300);
      expect(confirmed.json.isComplete).toBe(true);
      expect(confirmed.json.sinisterId).toBeDefined();

      let claims = await claimsOf(user);
      expect(claims).toHaveLength(1);
      expect(claims[0]).toMatchObject({ location: 'Alger', typeIncidentFr: 'accident' });
      expect(claims[0].documents).toHaveLength(1);
      expect(claims[0].partsEndommagees).toEqual(['pare-chocs arrière']);

      // The conversation's temporary copy of the photo is gone; the claim's document remains.
      const stored = [...t.storage.objects.keys()];
      expect(stored.some((url) => url.includes('/ai-sessions/'))).toBe(false);

      const followUp = await chat(user, { message: 'merci', sessionId });
      expect(followUp.status).toBeLessThan(300);
      expect(followUp.json.isComplete).toBe(false);

      claims = await claimsOf(user);
      expect(claims).toHaveLength(1);
    });

    it('never returns image bytes to the client', async () => {
      t.llm.extract = () => ({ typeSinistre: 'accident' });
      const res = await chatWithImages(user, { message: 'accident' }, [{ name: 'a.jpg', content: JPEG }]);

      expect(res.status).toBeLessThan(300);
      expect(res.json.imageAnalysis).toHaveLength(1);
      expect(res.json.imageAnalysis[0]).not.toHaveProperty('buffer');
      expect(res.json.imageAnalysis[0]).not.toHaveProperty('image');
      expect(res.text.length).toBeLessThan(JPEG.length);
    });

    it('says so when the claim could not be saved, and saves it once on retry', async () => {
      const sessionId = await declareUpToConfirmation(user);
      t.storage.failDownloads = true;

      const failed = await chat(user, { message: 'oui', sessionId });
      expect(failed.status).toBeLessThan(300);
      expect(failed.json.isComplete).toBe(false);
      expect(failed.json.response).toContain("pas pu enregistrer");
      expect(await claimsOf(user)).toHaveLength(0);

      t.storage.failDownloads = false;
      const retried = await chat(user, { message: 'oui', sessionId });
      expect(retried.json.isComplete).toBe(true);
      expect(await claimsOf(user)).toHaveLength(1);
    });
  });

  describe('conversations', () => {
    it('belong to the user who started them', async () => {
      t.llm.extract = () => ({ typeSinistre: 'accident' });
      const mine = await chat(user, { message: 'accident de voiture' });
      const sessionId: string = mine.json.sessionId;
      const stranger = await t.createUser(t.alpha, `ai-stranger-${Date.now()}`);
      const context = (as: TestUser) =>
        t.request({ method: 'GET', url: `/ai/context/${sessionId}`, tenant: t.alpha.slug, token: as.token });

      const own = await context(user);
      expect(own.status).toBe(200);
      expect(own.json.extractedData).toMatchObject({ typeSinistre: 'accident' });

      expect((await context(stranger)).status).toBe(404);

      // Using the same id, the stranger gets a conversation of their own, not mine.
      t.llm.extract = () => ({});
      const theirs = await chat(stranger, { message: 'bonjour', sessionId });
      expect(theirs.json.extractedData).toEqual({});
      expect((await context(user)).json.extractedData).toMatchObject({ typeSinistre: 'accident' });
    });

    it('can be forgotten', async () => {
      t.llm.extract = () => ({ typeSinistre: 'accident' });
      const sessionId: string = (await chat(user, { message: 'accident' })).json.sessionId;

      const reset = await t.request({
        method: 'DELETE',
        url: `/ai/context/${sessionId}`,
        tenant: t.alpha.slug,
        token: user.token,
      });
      expect(reset.status).toBe(200);

      const after = await t.request({
        method: 'GET',
        url: `/ai/context/${sessionId}`,
        tenant: t.alpha.slug,
        token: user.token,
      });
      expect(after.status).toBe(404);
    });

    it('account the model tokens they used', async () => {
      const sessionId: string = (await chat(user, { message: 'accident' })).json.sessionId;

      const usage = await t.request({
        method: 'GET',
        url: `/ai/usage/${sessionId}`,
        tenant: t.alpha.slug,
        token: user.token,
      });

      expect(usage.status).toBe(200);
      expect(usage.json.llmCalls).toBeGreaterThanOrEqual(3);
      expect(usage.json.totalTokens).toBe(usage.json.llmCalls * 15);
    });
  });

  describe('limits', () => {
    it('reject an over-long message and a made-up session id format', async () => {
      expect((await chat(user, { message: 'x'.repeat(4001) })).status).toBe(400);
      expect((await chat(user, { message: 'bonjour', sessionId: '../../etc' })).status).toBe(400);
    });

    it('reject a sixth image and a file that is not an image, before analysing anything', async () => {
      const analysed = t.llm.prompts.length;

      const tooMany = await chatWithImages(
        user,
        { message: 'photos' },
        Array.from({ length: 6 }, (_, i) => ({ name: `p${i}.jpg`, content: JPEG })),
      );
      const notAnImage = await chatWithImages(user, { message: 'photo' }, [
        { name: 'malware.jpg', content: Buffer.from('#!/bin/sh\necho not an image at all\n') },
      ]);

      expect(tooMany.status).toBe(400);
      expect(notAnImage.status).toBe(400);
      expect(t.llm.prompts).toHaveLength(analysed);
    });

    it('stop a user who reached the daily message limit', async () => {
      const tenants = t.app.get(TenantService);
      const beta = (await tenants.findBySlug(t.beta.slug))!;
      await tenants.update(beta.id, { config: { ...(beta.config ?? {}), ai: { dailyMessagesPerUser: 2 } } });
      const limited = await t.createUser(t.beta, `ai-limited-${Date.now()}`);
      const send = () =>
        t.request({
          method: 'POST',
          url: '/ai/chat',
          tenant: t.beta.slug,
          token: limited.token,
          body: { message: 'bonjour' },
        });
      try {
        expect((await send()).status).toBeLessThan(300);
        expect((await send()).status).toBeLessThan(300);
        const refused = await send();
        expect(refused.status).toBe(429);
        // A code of its own, so the app can tell it from ordinary rate limiting.
        expect(refused.json.code).toBe('AI_DAILY_LIMIT_REACHED');
      } finally {
        await tenants.update(beta.id, { config: beta.config ?? {} });
      }
    });
  });

  describe('model failures', () => {
    it.each([
      ['RATE_LIMIT_EXCEEDED', 429],
      ['TIMEOUT_ERROR', 504],
      ['QUOTA_EXCEEDED', 503],
    ] as const)('map %s to HTTP %i', async (type, status) => {
      t.llm.failNextWith = new LlmError('provider said no', type);

      const res = await chat(user, { message: 'bonjour' });

      expect(res.status).toBe(status);
      expect(res.json.code).toBe(type);
      expect(res.json.details.sessionId).toBeDefined();
    });
  });
});
