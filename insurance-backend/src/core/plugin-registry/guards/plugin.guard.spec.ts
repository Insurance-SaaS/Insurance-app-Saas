import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PluginGuard } from './plugin.guard';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { PluginRegistryService } from '../plugin-registry.service';

describe('PluginGuard', () => {
  let guard: PluginGuard;
  let reflector: Reflector;
  let tenantContext: Partial<TenantContextService>;
  let pluginRegistry: Partial<PluginRegistryService>;

  const mockExecutionContext = (): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
    }) as any;

  beforeEach(() => {
    reflector = new Reflector();
    tenantContext = {
      getTenant: jest.fn(),
      getEnabledPlugins: jest.fn(),
    };
    pluginRegistry = {
      isPluginEnabled: jest.fn(),
    };
    guard = new PluginGuard(
      reflector,
      tenantContext as TenantContextService,
      pluginRegistry as PluginRegistryService,
    );
  });

  it('allows through when no plugin metadata is set', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    await expect(guard.canActivate(mockExecutionContext())).resolves.toBe(true);
  });

  it('rejects a plugin-gated route when no tenant is present', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('@insurance/claims');
    (tenantContext.getTenant as jest.Mock).mockReturnValue(undefined);
    await expect(guard.canActivate(mockExecutionContext())).rejects.toThrow(ForbiddenException);
  });

  // ── Fast path: pre-resolved context ─────────────────────────────

  it('uses pre-resolved plugins (fast path) — allowed', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('@insurance/claims');
    (tenantContext.getTenant as jest.Mock).mockReturnValue({ id: 't1' });
    (tenantContext.getEnabledPlugins as jest.Mock).mockReturnValue(
      new Set(['@insurance/claims', '@insurance/quotes']),
    );

    await expect(guard.canActivate(mockExecutionContext())).resolves.toBe(true);
    expect(pluginRegistry.isPluginEnabled).not.toHaveBeenCalled();
  });

  it('uses pre-resolved plugins (fast path) — denied', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('@insurance/erp');
    (tenantContext.getTenant as jest.Mock).mockReturnValue({ id: 't1' });
    (tenantContext.getEnabledPlugins as jest.Mock).mockReturnValue(new Set(['@insurance/claims']));

    await expect(guard.canActivate(mockExecutionContext())).rejects.toThrow(ForbiddenException);
    expect(pluginRegistry.isPluginEnabled).not.toHaveBeenCalled();
  });

  // ── Slow path: DB fallback ──────────────────────────────────────

  it('falls back to DB when plugins not pre-resolved — allowed', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('@insurance/claims');
    (tenantContext.getTenant as jest.Mock).mockReturnValue({ id: 't1' });
    (tenantContext.getEnabledPlugins as jest.Mock).mockReturnValue(undefined);
    (pluginRegistry.isPluginEnabled as jest.Mock).mockResolvedValue(true);

    await expect(guard.canActivate(mockExecutionContext())).resolves.toBe(true);
    expect(pluginRegistry.isPluginEnabled).toHaveBeenCalledWith('t1', '@insurance/claims');
  });

  it('falls back to DB when plugins not pre-resolved — denied', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('@insurance/erp');
    (tenantContext.getTenant as jest.Mock).mockReturnValue({ id: 't1' });
    (tenantContext.getEnabledPlugins as jest.Mock).mockReturnValue(undefined);
    (pluginRegistry.isPluginEnabled as jest.Mock).mockResolvedValue(false);

    await expect(guard.canActivate(mockExecutionContext())).rejects.toThrow(ForbiddenException);
  });
});
