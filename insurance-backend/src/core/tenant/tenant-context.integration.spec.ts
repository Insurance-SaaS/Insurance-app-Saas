import { TenantContextService } from './tenant.context';

/**
 * Integration test: Tenant Context Isolation
 *
 * Verifies AsyncLocalStorage properly isolates per-request state —
 * concurrent tenant contexts don't leak across each other.
 * This is the foundation of the entire multi-tenant SaaS architecture.
 */
describe('Tenant Context Isolation (integration)', () => {
  let tenantContext: TenantContextService;

  beforeEach(() => {
    tenantContext = new TenantContextService();
  });

  it('isolates tenant between concurrent requests', async () => {
    const tenantA = { id: 'a', slug: 'alpha', isActive: true } as any;
    const tenantB = { id: 'b', slug: 'beta', isActive: true } as any;

    const results: string[] = [];

    const requestA = new Promise<void>((resolve) => {
      tenantContext.runWithContext({}, async () => {
        tenantContext.setTenant(tenantA);
        tenantContext.setEnabledPlugins(['@insurance/claims', '@insurance/quotes']);

        // Simulate async work (e.g., DB query)
        await new Promise((r) => setTimeout(r, 30));

        // After delay, context should still hold tenant A
        results.push(`A:${tenantContext.getTenant()!.slug}`);
        expect(tenantContext.getTenant()!.id).toBe('a');
        expect(tenantContext.isPluginEnabled('@insurance/claims')).toBe(true);
        expect(tenantContext.getEnabledPlugins()!.size).toBe(2);
        resolve();
      });
    });

    const requestB = new Promise<void>((resolve) => {
      tenantContext.runWithContext({}, async () => {
        tenantContext.setTenant(tenantB);
        tenantContext.setEnabledPlugins(['@insurance/erp']);

        // Simulate async work — overlaps with request A
        await new Promise((r) => setTimeout(r, 10));

        // Should see tenant B, not A
        results.push(`B:${tenantContext.getTenant()!.slug}`);
        expect(tenantContext.getTenant()!.id).toBe('b');
        expect(tenantContext.isPluginEnabled('@insurance/erp')).toBe(true);
        expect(tenantContext.isPluginEnabled('@insurance/claims')).toBe(false);
        expect(tenantContext.getEnabledPlugins()!.size).toBe(1);
        resolve();
      });
    });

    // Run concurrently
    await Promise.all([requestA, requestB]);

    // B finishes first (10ms), A finishes second (30ms)
    expect(results).toEqual(['B:beta', 'A:alpha']);
  });

  it('returns defaults when accessed outside any context', () => {
    // No runWithContext() — should not throw
    expect(tenantContext.getTenant()).toBeUndefined();
    expect(tenantContext.getDataSource()).toBeUndefined();
    expect(tenantContext.getEnabledPlugins()).toBeUndefined();
    // No tenant context means no plugin is enabled.
    expect(tenantContext.isPluginEnabled('@insurance/anything')).toBe(false);
  });

  it('plugin context survives nested async operations', async () => {
    const tenant = { id: 'nested', slug: 'nested-co' } as any;
    const plugins = ['@insurance/claims', '@insurance/notifications'];

    await new Promise<void>((resolve) => {
      tenantContext.runWithContext({}, async () => {
        tenantContext.setTenant(tenant);
        tenantContext.setEnabledPlugins(plugins);

        // Nested async: setTimeout
        await new Promise<void>((r) =>
          setTimeout(async () => {
            expect(tenantContext.getTenant()!.slug).toBe('nested-co');

            // Nested async: Promise.resolve chain
            await Promise.resolve().then(() => {
              expect(tenantContext.isPluginEnabled('@insurance/claims')).toBe(true);
              expect(tenantContext.isPluginEnabled('@insurance/erp')).toBe(false);
            });

            r();
          }, 5),
        );

        // Still accessible after nested awaits
        expect(tenantContext.getEnabledPlugins()!.size).toBe(2);
        resolve();
      });
    });
  });

  it('setTenant/setDataSource/setEnabledPlugins are no-ops outside context', () => {
    // Calling setters without runWithContext should not throw
    expect(() => tenantContext.setTenant({ id: 'orphan' } as any)).not.toThrow();
    expect(() => tenantContext.setDataSource({} as any)).not.toThrow();
    expect(() => tenantContext.setEnabledPlugins(['@insurance/x'])).not.toThrow();

    // Values should remain undefined (no store to write to)
    expect(tenantContext.getTenant()).toBeUndefined();
    expect(tenantContext.getEnabledPlugins()).toBeUndefined();
  });
});
