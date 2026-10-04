import { TenantMigrationRunner } from './tenant-migration.runner';

describe('TenantMigrationRunner', () => {
  const tenant = { id: 't1', slug: 'acme' };

  const tenantServiceMock = {
    findBySlug: jest.fn(),
    getActiveTenants: jest.fn(),
    acquireMigrationLease: jest.fn(),
    releaseMigrationLease: jest.fn(),
    recordState: jest.fn(),
  };
  const dataSource = {};
  const managerMock = { getDataSource: jest.fn() };
  const schemaManagerMock = {
    ensureCurrent: jest.fn(),
    revertTo: jest.fn(),
    currentVersion: jest.fn(),
    drift: jest.fn(),
  };

  let runner: TenantMigrationRunner;

  beforeEach(() => {
    jest.clearAllMocks();
    tenantServiceMock.findBySlug.mockResolvedValue(tenant);
    tenantServiceMock.acquireMigrationLease.mockResolvedValue(true);
    managerMock.getDataSource.mockResolvedValue(dataSource);
    runner = new TenantMigrationRunner(
      tenantServiceMock as any,
      managerMock as any,
      schemaManagerMock as any,
    );
  });

  it('brings a tenant to the current schema and records the outcome', async () => {
    schemaManagerMock.ensureCurrent.mockResolvedValue({
      mode: 'migrated',
      applied: ['AddThing1759536000001'],
      version: 'AddThing1759536000001',
      drift: [],
    });

    const result = await runner.runForTenant('acme');

    expect(result).toMatchObject({
      success: true,
      mode: 'migrated',
      appliedMigrations: ['AddThing1759536000001'],
      version: 'AddThing1759536000001',
      drift: [],
    });
    expect(tenantServiceMock.recordState).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ schemaVersion: 'AddThing1759536000001', schemaDrift: 0 }),
    );
    expect(tenantServiceMock.releaseMigrationLease).toHaveBeenCalledWith('t1');
  });

  it('does not run while another run holds the lease', async () => {
    tenantServiceMock.acquireMigrationLease.mockResolvedValue(false);

    const result = await runner.runForTenant('acme');

    expect(result.success).toBe(false);
    expect(schemaManagerMock.ensureCurrent).not.toHaveBeenCalled();
    expect(tenantServiceMock.releaseMigrationLease).not.toHaveBeenCalled();
  });

  it('reports a failure and still releases the lease', async () => {
    schemaManagerMock.ensureCurrent.mockRejectedValue(new Error('connection refused'));

    const result = await runner.runForTenant('acme');

    expect(result).toMatchObject({ success: false, error: 'connection refused' });
    expect(tenantServiceMock.releaseMigrationLease).toHaveBeenCalledWith('t1');
  });

  it('keeps going when one tenant fails', async () => {
    tenantServiceMock.getActiveTenants.mockResolvedValue([
      { id: 't1', slug: 'acme' },
      { id: 't2', slug: 'globex' },
    ]);
    tenantServiceMock.findBySlug.mockImplementation((slug: string) =>
      Promise.resolve({ id: slug === 'acme' ? 't1' : 't2', slug }),
    );
    schemaManagerMock.ensureCurrent
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ mode: 'migrated', applied: [], version: 'v', drift: [] });

    const results = await runner.runForAllActiveTenants(1);

    expect(results.map((r) => r.success)).toEqual([false, true]);
  });

  it('reverts to a named version', async () => {
    schemaManagerMock.revertTo.mockResolvedValue(['AddThing1759536000001']);
    schemaManagerMock.currentVersion.mockResolvedValue('TenantBaseline1759536000000');

    const result = await runner.revertTenantTo('acme', 'TenantBaseline1759536000000');

    expect(schemaManagerMock.revertTo).toHaveBeenCalledWith(dataSource, 'TenantBaseline1759536000000');
    expect(result).toMatchObject({
      success: true,
      revertedMigrations: ['AddThing1759536000001'],
      version: 'TenantBaseline1759536000000',
    });
  });

  it('reports an unknown tenant', async () => {
    tenantServiceMock.findBySlug.mockResolvedValue(null);

    expect(await runner.runForTenant('nope')).toMatchObject({
      success: false,
      error: 'Tenant not found',
    });
  });
});
