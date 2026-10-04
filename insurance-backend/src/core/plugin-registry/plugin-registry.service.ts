import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantPlugin } from './entities/tenant-plugin.entity';
import { IPluginRegistryService } from 'src/contracts/interfaces/i-plugin-registry.service';
import {
  PluginManifest,
  PLUGIN_NAMESPACE,
  pluginId as normalizePluginId,
} from 'src/contracts/types/plugin-manifest';

@Injectable()
export class PluginRegistryService implements IPluginRegistryService, OnModuleInit {
  private readonly logger = new Logger(PluginRegistryService.name);
  private readonly manifests = new Map<string, PluginManifest>();
  /** Enabled plugin ids per tenant; read on every request, so cached briefly per process. */
  private static readonly CACHE_TTL_MS = 30_000;
  private readonly enabledByTenant = new Map<string, { ids: string[]; expiresAt: number }>();

  constructor(
    @InjectRepository(TenantPlugin)
    private readonly repo: Repository<TenantPlugin>,
  ) {}

  onModuleInit() {
    this.logger.log(`Plugin registry initialised with ${this.manifests.size} manifest(s)`);
  }

  // ── Manifest management ────────────────────────────────────────────

  registerPlugin(manifest: PluginManifest): void {
    const id = normalizePluginId(manifest.id);
    if (this.manifests.has(id)) {
      this.logger.warn(`Plugin "${id}" already registered — overwriting`);
    }
    this.manifests.set(id, { ...manifest, id });
    this.logger.log(`Registered plugin: ${id} v${manifest.version}`);
  }

  getRegisteredPlugins(): PluginManifest[] {
    return Array.from(this.manifests.values());
  }

  getPluginManifest(pluginId: string): PluginManifest | undefined {
    return this.manifests.get(normalizePluginId(pluginId));
  }

  // ── Per-tenant resolution ──────────────────────────────────────────

  /**
   * A plugin is enabled for a tenant if, and only if, there is a row saying so.
   * This is the single rule: the middleware, the guard and listeners all go
   * through getEnabledPlugins().
   */
  async isPluginEnabled(tenantId: string, pluginId: string): Promise<boolean> {
    return (await this.getEnabledPlugins(tenantId)).includes(normalizePluginId(pluginId));
  }

  async getEnabledPlugins(tenantId: string): Promise<string[]> {
    const cached = this.enabledByTenant.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return [...cached.ids];
    }

    const entries = await this.repo.find({
      where: { tenantId, isEnabled: true },
    });

    // Normalize returned IDs to @insurance/ format.
    const ids = entries.map((e) => this.ensureNamespace(e.componentName));
    this.enabledByTenant.set(tenantId, {
      ids,
      expiresAt: Date.now() + PluginRegistryService.CACHE_TTL_MS,
    });
    return [...ids];
  }

  async getTenantPlugins(tenantId: string): Promise<TenantPlugin[]> {
    return this.repo.find({
      where: { tenantId },
      order: { componentName: 'ASC' },
    });
  }

  async upsertPlugin(
    tenantId: string,
    pluginId: string,
    isEnabled: boolean,
    config?: Record<string, unknown>,
  ): Promise<TenantPlugin> {
    const normalized = normalizePluginId(pluginId);
    const shortName = this.stripNamespace(normalized);

    // Find existing by either format.
    const existing = await this.repo.findOne({
      where: [
        { tenantId, componentName: normalized },
        { tenantId, componentName: shortName },
      ],
    });

    if (existing) {
      // Migrate legacy short name → full namespace on update.
      existing.componentName = normalized;
      existing.isEnabled = isEnabled;
      existing.config = (config as Record<string, any> | undefined) ?? existing.config;
      const saved = await this.repo.save(existing);
      this.enabledByTenant.delete(tenantId);
      return saved;
    }

    const created = this.repo.create({
      tenantId,
      componentName: normalized,
      isEnabled,
      config: config as Record<string, any> | undefined,
    });
    const saved = await this.repo.save(created);
    this.enabledByTenant.delete(tenantId);
    return saved;
  }

  /**
   * Applies several plugin changes for a tenant at once, after checking that
   * every plugin left enabled has its dependencies enabled too.
   *
   * With `seedAll`, a row is written for every registered plugin, so the state
   * never depends on a missing row: plugins not mentioned are enabled when no
   * change list is given at all, and disabled otherwise.
   */
  async setTenantPlugins(
    tenantId: string,
    changes: { componentName: string; isEnabled?: boolean; config?: Record<string, unknown> }[] = [],
    options: { seedAll?: boolean } = {},
  ): Promise<string[]> {
    const requested = new Map(
      changes.map((change) => [normalizePluginId(change.componentName), change]),
    );
    const existing = new Map<string, boolean>(
      (await this.getTenantPlugins(tenantId)).map((row) => [
        this.ensureNamespace(row.componentName),
        row.isEnabled,
      ]),
    );

    // The state every plugin should end up in.
    const target = new Map(existing);
    if (options.seedAll) {
      for (const manifest of this.getRegisteredPlugins()) {
        if (!target.has(manifest.id) && !requested.has(manifest.id)) {
          target.set(manifest.id, changes.length === 0);
        }
      }
    }
    for (const [id, change] of requested) {
      target.set(id, change.isEnabled ?? true);
    }
    this.assertDependenciesEnabled(target);

    for (const [id, enabled] of target) {
      if (requested.has(id) || !existing.has(id)) {
        await this.upsertPlugin(tenantId, id, enabled, requested.get(id)?.config);
      }
    }
    return this.getEnabledPlugins(tenantId);
  }

  /** Every enabled plugin must have the plugins it depends on enabled too. */
  private assertDependenciesEnabled(target: Map<string, boolean>): void {
    const enabled = [...target].filter(([, isEnabled]) => isEnabled).map(([id]) => id);
    for (const id of enabled) {
      const missing = (this.getPluginManifest(id)?.dependencies ?? [])
        .map((dependency) => normalizePluginId(dependency))
        .find((dependency) => !target.get(dependency));
      if (missing) {
        throw new BadRequestException(`Plugin "${id}" requires "${missing}" to be enabled`);
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private stripNamespace(id: string): string {
    return id.replace(`${PLUGIN_NAMESPACE}/`, '');
  }

  private ensureNamespace(name: string): string {
    return normalizePluginId(name);
  }
}
