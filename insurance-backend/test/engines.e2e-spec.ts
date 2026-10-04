import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { getDialect } from 'src/core/database/dialects';
import { SchemaKit } from 'src/core/database/schema/schema-kit';
import { SchemaManager } from 'src/core/database/schema/schema-manager';
import { TenantMigrationRunner } from 'src/core/database/tenant-migration.runner';
import { tenantDataSourceOptions } from 'src/core/database/tenant-datasource.options';
import { TenantService } from 'src/core/tenant/tenant.service';
import { Contacts, ContactType } from 'src/modules/branches/entities/contacts.entity';
import { Claim, ClaimStatus } from 'src/modules/claims/entities/claim.entity';
import { Log } from 'src/modules/logging/entities/log.entity';
import { DeviceToken } from 'src/modules/notifications/entities/device-token.entity';
import { Notification } from 'src/modules/notifications/entities/notification.entity';
import { PaymentTransaction } from 'src/modules/payment/entities/payment-transaction.entity';
import { User } from 'src/modules/users/entities/user.entity';
import { createDatabase, testServers } from './support/engines';
import { LATEST_TENANT_MIGRATION, TENANT_BASELINE, TENANT_MIGRATION_CLASSES } from './support/migrations';
import { bootTestApp, TestApp, TestTenant, TEST_PASSWORD } from './support/test-app';

const ARABIC = 'تصادم في الطريق السريع بين سيارتين، مع أضرار جسيمة في الجهة الأمامية. ';

/**
 * The same checks against every tenant. With the default settings tenant alpha
 * is on TEST_PLATFORM_ENGINE and tenant beta on TEST_SECOND_ENGINE, so this
 * proves the data layer on each engine with one set of entities and one process.
 */
describe.each(['alpha', 'beta'] as const)('Database engine of tenant %s', (slug) => {
  let t: TestApp;
  let tenant: TestTenant;
  let db: DataSource;
  let userId: string;

  beforeAll(async () => {
    t = await bootTestApp();
    tenant = t[slug];
    db = await t.tenantDataSource(tenant);
    userId = tenant.user.id;
  });

  afterAll(async () => {
    await t?.close();
  });

  it('reports its engine', () => {
    expect(db.options.type).toBe(tenant.engine);
  });

  describe('schema', () => {
    it('matches the entities exactly and is at the newest version', async () => {
      const schema = t.app.get(SchemaManager);

      expect(await schema.drift(db)).toEqual([]);
      expect(await schema.currentVersion(db)).toBe(LATEST_TENANT_MIGRATION);
    });

    it('is not touched by a second run', async () => {
      const result = await t.app.get(TenantMigrationRunner).runForTenant(tenant.slug);

      expect(result).toMatchObject({ success: true, mode: 'migrated', appliedMigrations: [], drift: [] });
    });

    it('never runs twice at the same time for one tenant', async () => {
      const runner = t.app.get(TenantMigrationRunner);

      const results = await Promise.all([
        runner.runForTenant(tenant.slug),
        runner.runForTenant(tenant.slug),
        runner.runForTenant(tenant.slug),
      ]);

      expect(results.filter((r) => r.success).length).toBeGreaterThanOrEqual(1);
      for (const failed of results.filter((r) => !r.success)) {
        expect(failed.error).toMatch(/already in progress/);
      }
      const record = await t.app.get(TenantService).findById(tenant.id);
      expect(record!.migrationLockUntil).toBeNull();
    });

    /** A database of its own on this tenant's server, so a test can change its schema freely. */
    const separateDatabase = async (name: string) => {
      const database = await createDatabase(testServers()[tenant.engine], `${name}_${slug}`);
      return new DataSource(
        tenantDataSourceOptions({
          slug: name,
          databaseType: database.engine,
          databaseHost: database.host,
          databasePort: database.port,
          databaseName: database.database,
          databaseUsername: database.username,
          databasePassword: database.password,
          databaseOptions: { trustServerCertificate: true },
        } as any),
      ).initialize();
    };

    it('can be taken back to the baseline and forward again, ending exactly on the entities', async () => {
      const schema = t.app.get(SchemaManager);
      const scratch = await separateDatabase('roundtrip');
      try {
        await schema.ensureCurrent(scratch);

        const reverted = await schema.revertTo(scratch, TENANT_BASELINE);
        expect(reverted[0]).toBe(LATEST_TENANT_MIGRATION);
        expect(await schema.currentVersion(scratch)).toBe(TENANT_BASELINE);
        expect((await schema.drift(scratch)).join('\n')).toMatch(/damageDetails/);

        // The path an existing tenant takes on deploy: run what is pending.
        const report = await schema.ensureCurrent(scratch);
        expect(report.mode).toBe('migrated');
        expect(report.applied).toEqual(reverted.slice().reverse());
        expect(report.version).toBe(LATEST_TENANT_MIGRATION);
        expect(report.drift).toEqual([]);

        // And a migration that was interrupted can simply be run again.
        const queryRunner = scratch.createQueryRunner();
        for (const Migration of TENANT_MIGRATION_CLASSES.slice(1)) {
          await new Migration().up(queryRunner);
        }
        await queryRunner.release();
        expect(await schema.drift(scratch)).toEqual([]);
      } finally {
        await scratch.destroy();
      }
    });

    it('refuses to set up a database that already holds foreign tables', async () => {
      const foreign = await separateDatabase('foreign');
      try {
        const queryRunner = foreign.createQueryRunner();
        if (!(await queryRunner.hasTable('users'))) {
          await queryRunner.query('CREATE TABLE users (legacy_id int)');
        }
        await queryRunner.release();

        await expect(t.app.get(SchemaManager).ensureCurrent(foreign)).rejects.toThrow(
          /already contains a "users" table/,
        );
      } finally {
        await foreign.destroy();
      }
    });
  });

  describe('migration helpers', () => {
    const withKit = async (work: (kit: SchemaKit) => Promise<void>) => {
      const queryRunner = db.createQueryRunner();
      try {
        await work(new SchemaKit(queryRunner));
      } finally {
        await queryRunner.release();
      }
    };
    const drift = () => t.app.get(SchemaManager).drift(db);

    it('add a missing column exactly as the entity declares it, and can be re-run', async () => {
      await withKit((kit) => kit.dropColumn('logs', 'actionDuration'));
      expect((await drift()).length).toBeGreaterThan(0);

      await withKit((kit) => kit.addEntityColumn(Log, 'actionDuration'));
      await withKit((kit) => kit.addEntityColumn(Log, 'actionDuration'));

      expect(await drift()).toEqual([]);
    });

    it('recreate a missing table with its indexes and foreign keys', async () => {
      await withKit((kit) => kit.dropTable('contacts'));
      expect((await drift()).length).toBeGreaterThan(0);

      await withKit((kit) => kit.createEntityTable(Contacts));
      await withKit((kit) => kit.createEntityTable(Contacts));

      expect(await drift()).toEqual([]);
      const contacts = db.getRepository(Contacts);
      const saved = await contacts.save(contacts.create({ type: ContactType.EMAIL, value: 'a@b.test' }));
      expect(saved.id).toBeDefined();
    });

    it('recreate a missing index', async () => {
      // The plain index on the token column. (An index that backs a foreign key
      // cannot be dropped on its own on MySQL and MariaDB.)
      const metadata = db.getMetadata(DeviceToken);
      const tokenIndex = metadata.indices.find(
        (index) => index.columns.length === 1 && index.columns[0].propertyName === 'token',
      )!;
      await withKit((kit) => kit.dropIndex(metadata.tablePath, tokenIndex.name));
      expect((await drift()).length).toBeGreaterThan(0);

      await withKit((kit) => kit.createEntityIndexes(DeviceToken));
      await withKit((kit) => kit.createEntityIndexes(DeviceToken));

      expect(await drift()).toEqual([]);
    });
  });

  describe('column types', () => {
    it('round-trip long Arabic text, emoji, JSON, decimals, dates and booleans', async () => {
      const claims = db.getRepository(Claim);
      const description = ARABIC.repeat(80) + ' 🚗💥'; // about 5,600 characters
      const incidentAt = new Date('2026-03-01T22:30:00.000Z');

      const saved = await claims.save(
        claims.create({
          numDossier: `CLM-${slug}-${Date.now()}`,
          user: { id: userId } as any,
          typeIncidentEn: 'Accident',
          typeIncidentFr: 'Accident',
          typeIncidentAr: 'حادث',
          dateIncident: '2026-03-01' as any,
          timeIncident: incidentAt,
          location: 'الجزائر العاصمة',
          description,
          partsEndommagees: ['capot', 'pare-chocs avant', 'مصباح'],
          montantApprouve: 1234567.89,
          customFields: { plate: '12345-116-16', nested: { ok: true } },
        }),
      );
      const loaded = await claims.findOneOrFail({ where: { id: saved.id } });

      expect(loaded.description).toBe(description);
      expect(loaded.location).toBe('الجزائر العاصمة');
      expect(loaded.typeIncidentAr).toBe('حادث');
      expect(loaded.partsEndommagees).toEqual(['capot', 'pare-chocs avant', 'مصباح']);
      expect(loaded.customFields).toEqual({ plate: '12345-116-16', nested: { ok: true } });
      expect(loaded.montantApprouve).toBe(1234567.89);
      expect(loaded.coutReparation).toBeNull();
      expect(String(loaded.dateIncident)).toBe('2026-03-01');
      expect(new Date(loaded.timeIncident!).toISOString()).toBe(incidentAt.toISOString());
      expect(loaded.status).toBe(ClaimStatus.SUBMITTED);
      expect(loaded.createdAt).toBeInstanceOf(Date);
      expect(Math.abs(loaded.createdAt.getTime() - Date.now())).toBeLessThan(5 * 60_000);
    });

    it('apply boolean defaults', async () => {
      const notifications = db.getRepository(Notification);
      const saved = await notifications.save(
        notifications.create({ user: { id: userId } as any, title: 'Hello', body: 'World' }),
      );
      const loaded = await notifications.findOneOrFail({ where: { id: saved.id } });

      expect(loaded.isRead).toBe(false);
      expect(loaded.data).toBeNull();

      const tokens = db.getRepository(DeviceToken);
      const token = await tokens.save(
        tokens.create({ user: { id: userId } as any, token: `tok-${Date.now()}`, platform: 'android' }),
      );
      expect((await tokens.findOneOrFail({ where: { id: token.id } })).isActive).toBe(true);
    });

    it('store a full-length string of multi-byte characters', async () => {
      const payments = db.getRepository(PaymentTransaction);
      const description = 'ض'.repeat(1000);
      const saved = await payments.save(
        payments.create({
          referenceNumber: `PAY-${slug}-${Date.now()}`,
          userId,
          amount: 0.1,
          description,
        }),
      );
      const loaded = await payments.findOneOrFail({ where: { id: saved.id } });

      expect(loaded.description).toBe(description);
      expect(loaded.amount).toBe(0.1);
      expect(loaded.currency).toBe('DZD');
      expect(loaded.userId.toLowerCase()).toBe(userId.toLowerCase());
    });
  });

  describe('constraints', () => {
    it('allow many users without a phone but not two with the same phone', async () => {
      const users = db.getRepository(User);
      const dialect = getDialect(tenant.engine);
      const make = (name: string, phone?: string) =>
        users.save(
          users.create({ username: name, email: `${name}-${Date.now()}@${slug}.test`, phone }),
        );

      await make('no-phone-1');
      await make('no-phone-2');
      const phone = `+2136${String(Date.now()).slice(-8)}`;
      await make('with-phone', phone);

      const duplicate = await make('same-phone', phone).catch((error) => error);
      expect(duplicate).toBeInstanceOf(Error);
      expect(dialect.isUniqueViolation(duplicate)).toBe(true);
    });

    it('report a duplicate email as a unique violation', async () => {
      const users = db.getRepository(User);
      const duplicate = await users
        .save(users.create({ username: 'dup', email: tenant.user.email }))
        .catch((error) => error);

      expect(getDialect(tenant.engine).isUniqueViolation(duplicate)).toBe(true);
    });
  });

  describe('the application', () => {
    it('logs a user in, reads the profile and creates a payment', async () => {
      const login = await t.request({
        method: 'POST',
        url: '/auth/login',
        tenant: tenant.slug,
        body: { email: tenant.user.email, password: TEST_PASSWORD },
      });
      expect(login.status).toBeLessThan(300);
      const token: string = login.json.accessToken;

      const profile = await t.request({ method: 'GET', url: '/auth/profile', tenant: tenant.slug, token });
      expect(profile.status).toBe(200);
      expect(profile.json.email).toBe(tenant.user.email);

      const payment = await t.request({
        method: 'POST',
        url: '/payments',
        tenant: tenant.slug,
        token,
        body: { amount: 2500.5, method: 'cash', description: 'Franchise' },
      });
      expect(payment.status).toBeLessThan(300);
      expect(payment.json.amount).toBe(2500.5);

      const mine = await t.request({
        method: 'GET',
        url: `/payments/${payment.json.id}`,
        tenant: tenant.slug,
        token,
      });
      expect(mine.status).toBe(200);
      expect(mine.json.status).toBe('pending');
    });

    it('signs a new user up through the full OTP flow', async () => {
      const email = `signup-${Date.now()}@${slug}.test`;
      const send = (url: string, body: unknown) =>
        t.request({ method: 'POST', url, tenant: tenant.slug, body });

      expect(
        (await send('/auth/signup', { email, phone: '+213661234567', password: TEST_PASSWORD, username: 'newcomer' })).status,
      ).toBeLessThan(300);
      const otp = await t.readOtp(tenant, 'signup-email', email);
      expect((await send('/auth/verify-otp-email', { email, otpEmail: otp })).status).toBeLessThan(300);
      const created = await send('/auth/verify-otp', { email });

      expect(created.status).toBeLessThan(300);
      const stored = await db.getRepository(User).findOneOrFail({ where: { email } });
      expect(stored.role).toBe('user');
      expect(stored.preferredLanguage).toBe('en');
    });

    it('keeps this tenant\'s tokens out of the other tenant', async () => {
      const other = slug === 'alpha' ? t.beta : t.alpha;
      const token = new JwtService().sign(
        { sub: userId, email: tenant.user.email, tenantSlug: tenant.slug },
        { secret: process.env.JWT_SECRET_KEY, expiresIn: '5m' },
      );

      const res = await t.request({ method: 'GET', url: '/auth/profile', tenant: other.slug, token });

      expect(res.status).toBe(401);
      expect(await argon2.verify(await argon2.hash('x'), 'x')).toBe(true);
    });
  });
});
