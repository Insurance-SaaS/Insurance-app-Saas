import { BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { TenantOnboardingService } from './tenant-onboarding.service';

describe('TenantOnboardingService', () => {
  const env: Record<string, string> = {
    DB_TYPE: 'postgres',
    DB_HOST: 'platform-db',
    DB_PORT: '5432',
    DB_USER: 'platform',
    DB_PASSWORD: 'secret',
    DB_NAME: 'platform',
  };

  let stored: any;
  const tenantServiceMock = {
    findBySlug: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    recordState: jest.fn(),
  };
  const migrationRunnerMock = { runForTenant: jest.fn() };
  const usersRepoMock = {
    findOne: jest.fn(),
    create: jest.fn((x) => x),
    save: jest.fn((x) => Promise.resolve({ id: 'u1', ...x })),
  };
  const managerMock = {
    getDataSource: jest.fn(() => Promise.resolve({ getRepository: () => usersRepoMock })),
  };
  const pluginRegistryMock = {
    setTenantPlugins: jest.fn(() => Promise.resolve(['@insurance/claims'])),
  };
  const configMock = { get: jest.fn((key: string) => env[key]) };

  let service: TenantOnboardingService;

  const request = (overrides: Record<string, unknown> = {}) =>
    ({
      tenant: { slug: 'Acme', name: 'Acme Insurance' },
      tenantAdmin: { username: 'admin', email: 'admin@acme.com', password: 'Secret123!' },
      ...overrides,
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    stored = undefined;
    jest.spyOn(argon2, 'hash').mockResolvedValue('hashed-password' as never);

    tenantServiceMock.findBySlug.mockImplementation(() => Promise.resolve(stored ?? null));
    tenantServiceMock.findById.mockImplementation(() => Promise.resolve(stored));
    tenantServiceMock.create.mockImplementation((input) => {
      stored = { id: 't1', ...input };
      return Promise.resolve(stored);
    });
    tenantServiceMock.recordState.mockImplementation((_id, state) => {
      Object.assign(stored, state);
      return Promise.resolve();
    });
    migrationRunnerMock.runForTenant.mockResolvedValue({ success: true, version: 'v1', drift: [] });
    usersRepoMock.findOne.mockResolvedValue(null);

    service = new TenantOnboardingService(
      tenantServiceMock as any,
      migrationRunnerMock as any,
      managerMock as any,
      pluginRegistryMock as any,
      configMock as any,
    );
    // Creating a database opens a real connection; keep this a unit test.
    jest.spyOn(service as any, 'ensureDatabase').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'validateBroughtDatabase').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('onboards a managed tenant on the platform server and activates it last', async () => {
    const result = await service.onboard(request());

    expect(tenantServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'acme',
        isActive: false,
        provisioningMode: 'managed',
        databaseType: 'postgres',
        databaseHost: 'platform-db',
        databaseName: 'tenant_acme',
      }),
    );
    expect(migrationRunnerMock.runForTenant).toHaveBeenCalledWith('acme');
    expect(usersRepoMock.save).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'admin@acme.com', role: 'tenant_admin', password: 'hashed-password' }),
    );
    // One row per known plugin; the registry applies the "all enabled without a list" rule.
    expect(pluginRegistryMock.setTenantPlugins).toHaveBeenCalledWith('t1', [], { seedAll: true });
    expect(result.status).toBe('active');
    expect(stored).toMatchObject({ isActive: true, provisioningStatus: 'active', provisioningError: null });
  });

  it('validates a brought database before recording anything', async () => {
    (service as any).validateBroughtDatabase.mockRejectedValue(
      new BadRequestException('The tenant database cannot be used: connection refused'),
    );

    await expect(
      service.onboard(
        request({
          tenant: {
            slug: 'byod',
            name: 'B',
            databaseType: 'oracle',
            databaseHost: 'ora',
            databaseName: 'XEPDB1',
            databaseUsername: 'tenant',
            databasePassword: 'pw',
          },
        }),
      ),
    ).rejects.toThrow(/cannot be used/);
    expect(tenantServiceMock.create).not.toHaveBeenCalled();
  });

  it('passes an explicit component list to the registry', async () => {
    const components = [{ componentName: 'claims', isEnabled: true }];

    const result = await service.onboard(request({ components }));

    expect(pluginRegistryMock.setTenantPlugins).toHaveBeenCalledWith('t1', components, {
      seedAll: true,
    });
    expect(result.enabledComponents).toEqual(['@insurance/claims']);
  });

  it('stores the failure and resumes after the last completed step', async () => {
    migrationRunnerMock.runForTenant.mockResolvedValueOnce({ success: false, error: 'no privileges' });

    await expect(service.onboard(request())).rejects.toThrow(/stopped after step "database_ready"/);
    expect(stored).toMatchObject({ isActive: false, provisioningStatus: 'database_ready' });
    expect(stored.provisioningError).toContain('no privileges');

    const result = await service.onboard(request());

    expect(tenantServiceMock.create).toHaveBeenCalledTimes(1);
    expect((service as any).ensureDatabase).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('active');
  });

  it('does not create the admin twice when resumed', async () => {
    usersRepoMock.findOne.mockResolvedValue({ id: 'u1', email: 'admin@acme.com', username: 'admin' });

    const result = await service.onboard(request());

    expect(usersRepoMock.save).not.toHaveBeenCalled();
    expect(result.tenantAdmin.id).toBe('u1');
  });

  it('refuses a slug that is already active', async () => {
    stored = { id: 't1', slug: 'acme', provisioningStatus: 'active' };

    await expect(service.onboard(request())).rejects.toThrow(/already exists/);
  });

  it('refuses a managed tenant on another engine than the platform server', async () => {
    await expect(
      service.onboard(request({ tenant: { slug: 'x', name: 'X', databaseType: 'oracle' } })),
    ).rejects.toThrow(/Managed databases are created on the platform's own postgres server/);
  });
});
