import { PluginRegistryService } from './plugin-registry.service';
import { PluginManifest } from 'src/contracts/types/plugin-manifest';

describe('PluginRegistryService', () => {
  const repoMock = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn((data) => Promise.resolve(data)),
  };

  let service: PluginRegistryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PluginRegistryService(repoMock as any);
  });

  // ── Manifest Registration ─────────────────────────────────────────

  it('registers a plugin manifest and normalises the ID', () => {
    const manifest: PluginManifest = {
      id: 'claims',
      name: 'Claims',
      version: '1.0.0',
    };

    service.registerPlugin(manifest);
    const registered = service.getRegisteredPlugins();

    expect(registered).toHaveLength(1);
    expect(registered[0].id).toBe('@insurance/claims');
  });

  it('returns manifest by plugin ID', () => {
    service.registerPlugin({ id: '@insurance/quotes', name: 'Quotes', version: '1.0.0' });
    expect(service.getPluginManifest('quotes')).toBeDefined();
    expect(service.getPluginManifest('@insurance/quotes')).toBeDefined();
    expect(service.getPluginManifest('nonexistent')).toBeUndefined();
  });

  // ── Per-Tenant Resolution ─────────────────────────────────────────

  it('is disabled when no plugin row exists', async () => {
    repoMock.find.mockResolvedValue([]);
    await expect(service.isPluginEnabled('t1', '@insurance/claims')).resolves.toBe(false);
  });

  it('is enabled when an enabled row exists, under the full or the legacy short name', async () => {
    repoMock.find.mockResolvedValue([{ componentName: 'claims', isEnabled: true }]);

    await expect(service.isPluginEnabled('t1', '@insurance/claims')).resolves.toBe(true);
    await expect(service.isPluginEnabled('t1', 'claims')).resolves.toBe(true);
    await expect(service.isPluginEnabled('t1', '@insurance/erp')).resolves.toBe(false);
  });

  it('answers repeated checks from its short-lived cache', async () => {
    repoMock.find.mockResolvedValue([{ componentName: '@insurance/claims', isEnabled: true }]);

    await service.isPluginEnabled('t1', 'claims');
    await service.isPluginEnabled('t1', 'claims');

    expect(repoMock.find).toHaveBeenCalledTimes(1);
  });

  // ── Upsert ────────────────────────────────────────────────────────

  it('creates plugin config with normalised ID when missing', async () => {
    repoMock.findOne.mockResolvedValue(null);
    const result = await service.upsertPlugin('t1', 'erp', true, { mode: 'default' });

    expect(repoMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        componentName: '@insurance/erp',
        isEnabled: true,
      }),
    );
    expect(result).toMatchObject({
      tenantId: 't1',
      componentName: '@insurance/erp',
      isEnabled: true,
    });
  });

  it('migrates legacy short name to full namespace on update', async () => {
    const existing = {
      tenantId: 't1',
      componentName: 'erp',
      isEnabled: false,
      config: {},
    };
    repoMock.findOne.mockResolvedValue(existing);

    await service.upsertPlugin('t1', 'erp', true, { mode: 'oracle' });

    expect(repoMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        componentName: '@insurance/erp',
        isEnabled: true,
        config: { mode: 'oracle' },
      }),
    );
  });

  // ── Enabled List ──────────────────────────────────────────────────

  it('normalises returned plugin IDs to @insurance/ format', async () => {
    repoMock.find.mockResolvedValue([
      { componentName: 'claims', isEnabled: true },
      { componentName: '@insurance/quotes', isEnabled: true },
    ]);

    const result = await service.getEnabledPlugins('t1');
    expect(result).toEqual(['@insurance/claims', '@insurance/quotes']);
  });

  // ── Batch updates ─────────────────────────────────────────────────

  describe('setTenantPlugins', () => {
    let rows: { tenantId: string; componentName: string; isEnabled: boolean }[];

    beforeEach(() => {
      rows = [];
      repoMock.find.mockImplementation(({ where }) =>
        Promise.resolve(
          rows.filter((r) => where.isEnabled === undefined || r.isEnabled === where.isEnabled),
        ),
      );
      repoMock.findOne.mockImplementation(({ where }) =>
        Promise.resolve(
          rows.find((r) => where.some((w: any) => w.componentName === r.componentName)) ?? null,
        ),
      );
      repoMock.save.mockImplementation((row) => {
        if (!rows.includes(row)) rows.push(row);
        return Promise.resolve(row);
      });

      service.registerPlugin({ id: '@insurance/claims', name: 'Claims', version: '1.0.0' });
      service.registerPlugin({ id: '@insurance/quotes', name: 'Quotes', version: '1.0.0' });
      service.registerPlugin({
        id: '@insurance/ai',
        name: 'AI',
        version: '1.0.0',
        dependencies: ['@insurance/claims', '@insurance/quotes'],
      });
    });

    it('writes a row for every registered plugin, all enabled, when seeding without a list', async () => {
      const enabled = await service.setTenantPlugins('t1', [], { seedAll: true });

      expect(enabled.sort()).toEqual(['@insurance/ai', '@insurance/claims', '@insurance/quotes']);
      expect(rows).toHaveLength(3);
    });

    it('turns off the plugins an explicit list leaves out', async () => {
      const enabled = await service.setTenantPlugins('t1', [{ componentName: 'claims' }], {
        seedAll: true,
      });

      expect(enabled).toEqual(['@insurance/claims']);
      expect(rows.filter((r) => !r.isEnabled).map((r) => r.componentName).sort()).toEqual([
        '@insurance/ai',
        '@insurance/quotes',
      ]);
    });

    it('refuses to enable a plugin without its dependencies, and changes nothing', async () => {
      await expect(
        service.setTenantPlugins('t1', [{ componentName: 'ai' }, { componentName: 'claims' }], {
          seedAll: true,
        }),
      ).rejects.toThrow('Plugin "@insurance/ai" requires "@insurance/quotes" to be enabled');
      expect(rows).toHaveLength(0);
    });

    it('refuses to disable a plugin that an enabled plugin depends on', async () => {
      await service.setTenantPlugins('t1', [], { seedAll: true });

      await expect(
        service.setTenantPlugins('t1', [{ componentName: 'quotes', isEnabled: false }]),
      ).rejects.toThrow(/requires "@insurance\/quotes"/);
    });
  });
});
