import { PluginRegistryService } from './plugin-registry.service';
import { PluginGuard } from './guards/plugin.guard';
import { PluginResolutionMiddleware } from './plugin-resolution.middleware';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { PluginManifest } from 'src/contracts/types/plugin-manifest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * Integration test: Plugin Lifecycle
 *
 * Tests the full flow across Phases 3–5:
 *   manifest registration → middleware plugin resolution → guard enforcement
 *
 * No DB required — uses in-memory mocks for the repository layer.
 */
describe('Plugin Lifecycle (integration)', () => {
  let registryService: PluginRegistryService;
  let tenantContext: TenantContextService;
  let middleware: PluginResolutionMiddleware;
  let guard: PluginGuard;
  let reflector: Reflector;

  // Minimal repo mock
  const repoMock = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((d: any) => d),
    save: jest.fn((d: any) => Promise.resolve(d)),
  };

  const MANIFESTS: PluginManifest[] = [
    { id: '@insurance/claims', name: 'Claims', version: '1.0.0' },
    { id: '@insurance/quotes', name: 'Quotes', version: '1.0.0' },
    { id: '@insurance/erp', name: 'ERP', version: '1.0.0' },
  ];

  const mockContext = (pluginId?: string): ExecutionContext => {
    const ctx = { getHandler: jest.fn(), getClass: jest.fn() } as any;
    if (pluginId) {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(pluginId);
    } else {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    }
    return ctx;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tenantContext = new TenantContextService();
    registryService = new PluginRegistryService(repoMock as any);
    middleware = new PluginResolutionMiddleware(tenantContext, registryService);
    reflector = new Reflector();
    guard = new PluginGuard(reflector, tenantContext, registryService);
  });

  // ─── Phase 3: Self-registration ──────────────────────────────────

  it('modules register manifests with @insurance/ namespace', () => {
    for (const m of MANIFESTS) {
      registryService.registerPlugin(m);
    }
    const registered = registryService.getRegisteredPlugins();
    expect(registered).toHaveLength(3);
    expect(registered.map((r) => r.id)).toEqual([
      '@insurance/claims',
      '@insurance/quotes',
      '@insurance/erp',
    ]);
  });

  it('normalises short names to @insurance/ namespace on registration', () => {
    registryService.registerPlugin({ id: 'branches', name: 'Branches', version: '1.0.0' });
    expect(registryService.getPluginManifest('branches')?.id).toBe('@insurance/branches');
    expect(registryService.getPluginManifest('@insurance/branches')?.id).toBe(
      '@insurance/branches',
    );
  });

  // ─── Full lifecycle: register → middleware → guard ────────────────

  it('middleware pre-resolves plugins, guard uses fast path', async () => {
    // Setup: tenant has claims + quotes enabled, erp disabled
    const tenant = { id: 'tenant-1', slug: 'acme', isActive: true } as any;
    repoMock.find.mockResolvedValue([
      { componentName: '@insurance/claims', isEnabled: true },
      { componentName: '@insurance/quotes', isEnabled: true },
    ]);

    await new Promise<void>((resolve) => {
      tenantContext.runWithContext({}, async () => {
        tenantContext.setTenant(tenant);

        // Middleware resolves plugins
        await middleware.use({}, {}, () => {});

        // Plugins should be in context now
        const plugins = tenantContext.getEnabledPlugins();
        expect(plugins).toBeDefined();
        expect(plugins!.has('@insurance/claims')).toBe(true);
        expect(plugins!.has('@insurance/quotes')).toBe(true);
        expect(plugins!.has('@insurance/erp')).toBe(false);

        // Guard allows enabled plugin (fast path — no DB call)
        repoMock.findOne.mockClear();
        const allowed = await guard.canActivate(mockContext('@insurance/claims'));
        expect(allowed).toBe(true);
        expect(repoMock.findOne).not.toHaveBeenCalled(); // fast path!

        // Guard blocks disabled plugin (fast path)
        await expect(guard.canActivate(mockContext('@insurance/erp'))).rejects.toThrow(
          ForbiddenException,
        );
        expect(repoMock.findOne).not.toHaveBeenCalled(); // still fast path!

        resolve();
      });
    });
  });

  it('guard asks the registry when the middleware has not run, with the same rule', async () => {
    const tenant = { id: 'tenant-2' } as any;
    repoMock.find.mockResolvedValue([{ componentName: '@insurance/claims', isEnabled: true }]);

    await new Promise<void>((resolve) => {
      tenantContext.runWithContext({}, async () => {
        tenantContext.setTenant(tenant);
        // No middleware.use() call — enabledPlugins is undefined

        const allowed = await guard.canActivate(mockContext('@insurance/claims'));
        expect(allowed).toBe(true);
        expect(repoMock.find).toHaveBeenCalled();
        await expect(guard.canActivate(mockContext('@insurance/erp'))).rejects.toThrow(
          ForbiddenException,
        );
        resolve();
      });
    });
  });

  it('a failed lookup never turns a plugin on', async () => {
    const tenant = { id: 'tenant-3' } as any;
    repoMock.find.mockRejectedValue(new Error('DB down'));

    await new Promise<void>((resolve) => {
      tenantContext.runWithContext({}, async () => {
        tenantContext.setTenant(tenant);

        // Middleware errors out silently
        const next = jest.fn();
        await middleware.use({}, {}, next);
        expect(next).toHaveBeenCalled(); // request not blocked

        // The middleware lets the request continue, but the guard cannot confirm
        // the plugin is enabled, so the gated route fails instead of opening.
        await expect(guard.canActivate(mockContext('@insurance/claims'))).rejects.toThrow('DB down');
        resolve();
      });
    });
  });

  it('guard rejects a plugin-gated route when no tenant is set', async () => {
    await new Promise<void>((resolve) => {
      tenantContext.runWithContext({}, async () => {
        // No tenant set: plugin state is per tenant, so nothing is enabled.
        await expect(guard.canActivate(mockContext('@insurance/claims'))).rejects.toThrow(
          ForbiddenException,
        );
        expect(repoMock.findOne).not.toHaveBeenCalled();
        resolve();
      });
    });
  });
});
