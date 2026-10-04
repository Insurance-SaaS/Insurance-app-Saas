import { DataSource } from 'typeorm';
import { TenantDataSourceManager } from './tenant-datasource.manager';
import { tenantConnectionFingerprint, tenantConnectionSettings } from './tenant-datasource.options';

const tenant = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 't1',
    slug: 'acme',
    databaseType: 'postgres',
    databaseHost: 'db.internal',
    databasePort: 5432,
    databaseName: 'acme',
    databaseUsername: 'acme',
    databasePassword: 'secret',
    ...overrides,
  }) as any;

describe('tenant connection settings', () => {
  it('come only from the tenant record', () => {
    expect(tenantConnectionSettings(tenant())).toMatchObject({
      host: 'db.internal',
      port: 5432,
      username: 'acme',
      password: 'secret',
      database: 'acme',
    });
  });

  it('are refused when the tenant has no database configured', () => {
    expect(() => tenantConnectionSettings(tenant({ databaseHost: null, databaseName: '' }))).toThrow(
      /no database connection configured \(missing: databaseHost, databaseName\)/,
    );
  });

  it('fail when an encrypted password cannot be decrypted', () => {
    const previous = process.env.TENANT_DB_ENCRYPTION_KEY;
    delete process.env.TENANT_DB_ENCRYPTION_KEY;
    try {
      expect(() =>
        tenantConnectionSettings(tenant({ databasePassword: 'enc:v1:AAAA' })),
      ).toThrow(/TENANT_DB_ENCRYPTION_KEY is not set/);
    } finally {
      if (previous !== undefined) process.env.TENANT_DB_ENCRYPTION_KEY = previous;
    }
  });

  it('change fingerprint when any connection detail changes', () => {
    expect(tenantConnectionFingerprint(tenant())).toBe(tenantConnectionFingerprint(tenant()));
    expect(tenantConnectionFingerprint(tenant({ databaseHost: 'other' }))).not.toBe(
      tenantConnectionFingerprint(tenant()),
    );
  });
});

describe('TenantDataSourceManager', () => {
  let manager: TenantDataSourceManager;
  let initialize: jest.SpyInstance;

  beforeEach(() => {
    manager = new TenantDataSourceManager();
    initialize = jest.spyOn(DataSource.prototype, 'initialize').mockImplementation(async function (
      this: DataSource,
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      Object.defineProperty(this, 'isInitialized', { value: true, configurable: true });
      return this;
    });
    jest.spyOn(DataSource.prototype, 'destroy').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await manager.onModuleDestroy();
    jest.restoreAllMocks();
  });

  it('opens one pool when many first requests arrive together', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => manager.getDataSource(tenant())),
    );

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(new Set(results).size).toBe(1);
  });

  it('replaces the pool when the connection details change', async () => {
    const first = await manager.getDataSource(tenant());
    const second = await manager.getDataSource(tenant({ databaseHost: 'moved.internal' }));

    expect(second).not.toBe(first);
    expect(first.destroy).toHaveBeenCalled();
  });

  it('closes pools that have been idle', async () => {
    const dataSource = await manager.getDataSource(tenant());
    (manager as any).open.get('t1').lastUsed = Date.now() - 60_000;

    await manager.closeIdleDataSources(30_000);

    expect(dataSource.destroy).toHaveBeenCalledTimes(1);
    expect((manager as any).open.has('t1')).toBe(false);
  });
});
