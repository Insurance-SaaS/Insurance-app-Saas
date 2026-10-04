import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { encryptCredential, isEncrypted } from 'src/shared/utils/credential-encryption.util';
import { Tenant } from './entities/tenant.entity';

@Injectable()
export class TenantService {
  /**
   * The tenant is resolved on every request, so found tenants are cached for a
   * short time. The cache is per process (not Redis) because the row carries
   * database credentials; a change made on another instance is seen after the TTL.
   */
  private static readonly CACHE_TTL_MS = 30_000;
  private readonly bySlug = new Map<string, { tenant: Tenant; expiresAt: number }>();

  // Slugs that were looked up and do not exist, remembered briefly so that
  // requests naming made-up tenants cannot each cost a database query. Bounded,
  // and short enough that a tenant created on another instance appears quickly.
  private static readonly UNKNOWN_TTL_MS = 10_000;
  private static readonly UNKNOWN_MAX = 1000;
  private readonly unknownUntil = new Map<string, number>();

  private forgetCached(): void {
    this.bySlug.clear();
    this.unknownUntil.clear();
  }

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly configService: ConfigService,
  ) {}

  async findBySlug(slug: string): Promise<Tenant | null> {
    const cached = this.bySlug.get(slug);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.tenant;
    }

    if ((this.unknownUntil.get(slug) ?? 0) > Date.now()) {
      return null;
    }

    const tenant = await this.tenantRepository.findOne({ where: { slug } });
    if (tenant) {
      this.bySlug.set(slug, { tenant, expiresAt: Date.now() + TenantService.CACHE_TTL_MS });
      this.unknownUntil.delete(slug);
    } else {
      this.bySlug.delete(slug);
      if (this.unknownUntil.size >= TenantService.UNKNOWN_MAX) {
        // Oldest entry first (Map keeps insertion order).
        this.unknownUntil.delete(this.unknownUntil.keys().next().value as string);
      }
      this.unknownUntil.set(slug, Date.now() + TenantService.UNKNOWN_TTL_MS);
    }
    return tenant;
  }

  async findById(id: string): Promise<Tenant | null> {
    return this.tenantRepository.findOne({ where: { id } });
  }

  async findAll(): Promise<Tenant[]> {
    return this.tenantRepository.find({ order: { createdAt: 'DESC' } });
  }

  async create(input: Partial<Tenant>): Promise<Tenant> {
    const tenant = this.tenantRepository.create(this.withEncryptedPassword(input));
    const saved = await this.tenantRepository.save(tenant);
    this.forgetCached();
    return saved;
  }

  async update(id: string, updates: Partial<Tenant>): Promise<Tenant | null> {
    await this.tenantRepository.update({ id }, this.withEncryptedPassword(updates));
    this.forgetCached();
    return this.findById(id);
  }

  async getActiveTenants(): Promise<Tenant[]> {
    return this.tenantRepository.find({ where: { isActive: true } });
  }

  /**
   * Takes the schema-run lease of a tenant. Only one caller gets it: the update
   * only matches while no unexpired lease exists.
   */
  async acquireMigrationLease(id: string, ttlMs: number): Promise<boolean> {
    const now = new Date();
    const result = await this.tenantRepository
      .createQueryBuilder()
      .update(Tenant)
      .set({ migrationLockUntil: new Date(now.getTime() + ttlMs) })
      .where([
        { id, migrationLockUntil: IsNull() },
        { id, migrationLockUntil: LessThan(now) },
      ])
      .execute();
    return result.affected === 1;
  }

  async releaseMigrationLease(id: string): Promise<void> {
    await this.tenantRepository.update({ id }, { migrationLockUntil: null });
  }

  /** Records provisioning or schema state without touching connection details. */
  async recordState(
    id: string,
    state: Partial<
      Pick<
        Tenant,
        | 'isActive'
        | 'provisioningStatus'
        | 'provisioningError'
        | 'schemaVersion'
        | 'schemaCheckedAt'
        | 'schemaDrift'
      >
    >,
  ): Promise<void> {
    await this.tenantRepository.update({ id }, state);
    this.forgetCached();
  }

  /** The database password is only ever stored encrypted. */
  private withEncryptedPassword<T extends Partial<Tenant>>(input: T): T {
    if (!input.databasePassword || isEncrypted(input.databasePassword)) {
      return input;
    }
    const key = this.configService.get<string>('TENANT_DB_ENCRYPTION_KEY');
    if (!key) {
      throw new InternalServerErrorException(
        'TENANT_DB_ENCRYPTION_KEY must be configured before tenant database credentials can be stored',
      );
    }
    return { ...input, databasePassword: encryptCredential(input.databasePassword, key) };
  }
}
