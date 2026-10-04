import { TenantContextService } from './tenant.context';
import { TenantMiddleware } from './tenant.middleware';
import { TenantDataSourceMiddleware } from 'src/core/database/tenant-datasource.middleware';
import { PluginResolutionMiddleware } from 'src/core/plugin-registry/plugin-resolution.middleware';

/**
 * Integration test: Middleware Pipeline Ordering
 *
 * Verifies the 3-stage middleware pipeline from Phase 5:
 *   TenantMiddleware → TenantDataSourceMiddleware → PluginResolutionMiddleware
 *
 * Tests that each stage enriches TenantContextService and
 * subsequent stages can read what previous stages wrote.
 */
describe('Middleware Pipeline (integration)', () => {
  let tenantContext: TenantContextService;

  const fakeTenant = {
    id: 'tenant-pipeline',
    slug: 'pipeline-co',
    isActive: true,
    name: 'Pipeline Co',
  } as any;

  const fakeDataSource = { isInitialized: true, name: 'pipeline_db' } as any;

  // Service mocks
  const tenantServiceMock = {
    findBySlug: jest.fn().mockResolvedValue(fakeTenant),
  };
  const dataSourceManagerMock = {
    getDataSource: jest.fn().mockResolvedValue(fakeDataSource),
  };
  const pluginRegistryMock = {
    getEnabledPlugins: jest
      .fn()
      .mockResolvedValue(['@insurance/claims', '@insurance/quotes', '@insurance/notifications']),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tenantContext = new TenantContextService();
  });

  it('runs 3 middlewares in order, each enriching the context', async () => {
    const tenantMiddleware = new TenantMiddleware(tenantServiceMock as any, tenantContext);
    const dataSourceMiddleware = new TenantDataSourceMiddleware(
      tenantContext,
      dataSourceManagerMock as any,
    );
    const pluginMiddleware = new PluginResolutionMiddleware(
      tenantContext,
      pluginRegistryMock as any,
    );

    const req = { headers: { 'x-tenant-id': 'pipeline-co' } } as any;
    const res = {} as any;

    await new Promise<void>((resolve, reject) => {
      // Stage 1: TenantMiddleware
      tenantMiddleware.use(req, res, async (err1) => {
        try {
          if (err1) throw err1;

          // After stage 1: tenant is in context
          expect(tenantContext.getTenant()).toBeDefined();
          expect(tenantContext.getTenant()!.slug).toBe('pipeline-co');

          // Stage 2: TenantDataSourceMiddleware
          await dataSourceMiddleware.use(req as any, res as any, async (err2) => {
            try {
              if (err2) throw err2;

              // After stage 2: dataSource is in context
              expect(tenantContext.getDataSource()).toBeDefined();
              expect(tenantContext.getDataSource()!.name).toBe('pipeline_db');

              // Stage 3: PluginResolutionMiddleware
              await pluginMiddleware.use(req, res, (err3) => {
                try {
                  if (err3) throw err3;

                  // After stage 3: plugins are in context
                  const plugins = tenantContext.getEnabledPlugins();
                  expect(plugins).toBeDefined();
                  expect(plugins!.size).toBe(3);
                  expect(plugins!.has('@insurance/claims')).toBe(true);
                  expect(plugins!.has('@insurance/quotes')).toBe(true);
                  expect(plugins!.has('@insurance/notifications')).toBe(true);
                  expect(plugins!.has('@insurance/erp')).toBe(false);

                  // All 3 context layers are populated
                  expect(tenantContext.getTenant()).toBeDefined();
                  expect(tenantContext.getDataSource()).toBeDefined();
                  expect(tenantContext.getEnabledPlugins()).toBeDefined();

                  resolve();
                } catch (e) {
                  reject(e);
                }
              });
            } catch (e) {
              reject(e);
            }
          });
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it('skips plugin resolution when no tenant header is present', async () => {
    const tenantMiddleware = new TenantMiddleware(tenantServiceMock as any, tenantContext);
    const pluginMiddleware = new PluginResolutionMiddleware(
      tenantContext,
      pluginRegistryMock as any,
    );

    const req = { headers: {} } as any;
    const res = {} as any;

    await new Promise<void>((resolve) => {
      tenantMiddleware.use(req, res, async () => {
        expect(tenantContext.getTenant()).toBeUndefined();

        await pluginMiddleware.use(req, res, () => {
          // Plugins should NOT be resolved
          expect(tenantContext.getEnabledPlugins()).toBeUndefined();
          expect(pluginRegistryMock.getEnabledPlugins).not.toHaveBeenCalled();
          resolve();
        });
      });
    });
  });

  it('skips later stages when tenant is inactive', async () => {
    tenantServiceMock.findBySlug.mockResolvedValueOnce({ ...fakeTenant, isActive: false });
    const tenantMiddleware = new TenantMiddleware(tenantServiceMock as any, tenantContext);

    const req = { headers: { 'x-tenant-id': 'inactive-co' } } as any;
    // Simulate a raw ServerResponse for the 404
    const res = {
      writeHead: jest.fn(),
      end: jest.fn(),
    } as any;

    await new Promise<void>((resolve) => {
      tenantMiddleware.use(req, res, () => {
        // next() should NOT be called for inactive tenants
        throw new Error('next() should not be called');
      });

      // Give the async callback time to complete
      setTimeout(() => {
        expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
        expect(tenantContext.getTenant()).toBeUndefined();
        resolve();
      }, 50);
    });
  });
});
