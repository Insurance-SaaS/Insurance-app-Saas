import { BadRequestException, Injectable, NotFoundException, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mapping } from './entities/mapping.entity';
import { IUsersService } from 'src/contracts/interfaces/i-users.service';
import { IQuotesService } from 'src/contracts/interfaces/i-quotes.service';
import { ICacheService } from 'src/contracts/interfaces/i-cache.service';
import { USERS_SERVICE, QUOTES_SERVICE, CACHE_SERVICE } from 'src/contracts/tokens';
import { Contract } from './entities/contract.entity';
import { CreateContractDto } from './dtos/create-contract.dto';
import { TenantRepositoryFactory } from 'src/core/database/tenant-repository.factory';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { CustomFieldsService } from 'src/core/custom-fields/custom-fields.service';
import { CustomFieldEntityType } from 'src/core/custom-fields/entities/custom-field-definition.entity';
import { randomUUID } from 'node:crypto';

@Injectable()
export class ErpService {
  private readonly logger = new Logger(ErpService.name);
  private readonly cacheNamespace = 'erp';

  private async tryGetCachedByAccountId(externalAccountId: string): Promise<any> {
    return this.cacheService.get(this.cacheNamespace, `account:${externalAccountId}`);
  }

  private async tryGetCachedByUserId(userId: string): Promise<any> {
    return this.cacheService.get(this.cacheNamespace, `user:${userId}`);
  }

  private async tryGetCachedAll(): Promise<any> {
    return this.cacheService.get(this.cacheNamespace, 'all');
  }

  private async cacheMapping(mapping: any): Promise<void> {
    await this.cacheService.set(
      this.cacheNamespace,
      `account:${mapping.externalAccountId}`,
      mapping,
    );
    if (mapping.user?.id) {
      await this.cacheService.set(this.cacheNamespace, `user:${mapping.user.id}`, mapping);
    }
  }

  private async cacheAllMappings(mappings: any[]): Promise<void> {
    await this.cacheService.set(this.cacheNamespace, 'all', mappings);
  }

  private async invalidateMappingCache(mapping: any): Promise<void> {
    const keys = [`account:${mapping.externalAccountId}`];
    if (mapping.user?.id) keys.push(`user:${mapping.user.id}`);
    keys.push('all');
    await this.cacheService.invalidate(this.cacheNamespace, ...keys);
  }

  constructor(
    private readonly tenantRepositoryFactory: TenantRepositoryFactory,
    @Inject(USERS_SERVICE)
    private readonly usersService: IUsersService,
    @Inject(QUOTES_SERVICE)
    private readonly devisService: IQuotesService,
    @Inject(CACHE_SERVICE)
    private readonly cacheService: ICacheService,
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly customFieldsService: CustomFieldsService,
  ) {}

  private get mappingRepository() {
    return this.tenantRepositoryFactory.getRepository(Mapping);
  }

  private get contractRepository() {
    return this.tenantRepositoryFactory.getRepository(Contract);
  }

  async createMapping(externalAccountId: string, userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingMapping = await this.mappingRepository.findOne({
      where: { externalAccountId },
    });
    if (existingMapping) {
      throw new BadRequestException('Mapping already exists for this account');
    }

    const existingUserMapping = await this.mappingRepository.findOne({
      where: { user: { id: userId } },
    });
    if (existingUserMapping) {
      throw new BadRequestException('User is already mapped to another account');
    }

    const newMapping = this.mappingRepository.create({ externalAccountId, user });
    const saved = await this.mappingRepository.save(newMapping);
    await this.invalidateMappingCache(saved);
    return saved;
  }

  async getMappings() {
    // Try cache first
    const cached = await this.tryGetCachedAll();
    if (cached) {
      return cached;
    }

    const mappings = await this.mappingRepository.find({ relations: ['user'] });
    await this.cacheAllMappings(mappings);
    return mappings;
  }

  async deleteMapping(externalAccountId: string) {
    const mapping = await this.mappingRepository.findOne({
      where: { externalAccountId },
      relations: ['user'],
    });
    if (!mapping) {
      throw new NotFoundException('Mapping not found');
    }
    await this.mappingRepository.delete({ externalAccountId });
    await this.invalidateMappingCache(mapping);
    return { message: 'Mapping deleted successfully' };
  }

  async updateMapping(externalAccountId: string, userId: string) {
    const existingMapping = await this.mappingRepository.findOne({
      where: { externalAccountId },
      relations: ['user'],
    });
    if (!existingMapping) {
      throw new NotFoundException('Mapping not found');
    }
    // Drop the cached entries of the previous owner before re-linking.
    await this.invalidateMappingCache(existingMapping);

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const userMapping = await this.mappingRepository.findOne({
      where: { user: { id: userId } },
    });
    if (userMapping && userMapping.externalAccountId !== externalAccountId) {
      throw new BadRequestException('User is already mapped to another account');
    }

    existingMapping.user = user;
    await this.mappingRepository.save(existingMapping);
    await this.invalidateMappingCache(existingMapping);
    return this.mappingRepository.findOne({
      where: { externalAccountId },
      relations: ['user'],
    });
  }

  async getMappingByUser(userId: string) {
    // Try cache first
    const cached = await this.tryGetCachedByUserId(userId);
    if (cached) {
      return cached;
    }

    const mapping = await this.mappingRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });
    if (!mapping) {
      throw new NotFoundException('Mapping not found for this user');
    }

    await this.cacheMapping(mapping);
    return mapping;
  }

  async getMappingByAccount(externalAccountId: string) {
    const cached = await this.tryGetCachedByAccountId(externalAccountId);
    if (cached) {
      return cached;
    }

    const mapping = await this.mappingRepository.findOne({
      where: { externalAccountId },
      relations: ['user'],
    });
    if (!mapping) {
      throw new NotFoundException('Mapping not found for this account');
    }

    await this.cacheMapping(mapping);
    return mapping;
  }

  async createContract(newContract: CreateContractDto, userId: string) {
    if (newContract.customFields) {
      const tenant = this.tenantContext.getTenant();
      if (!tenant) {
        throw new BadRequestException('Tenant context is required for custom fields');
      }

      const validation = await this.customFieldsService.validateCustomFields(
        tenant.id,
        CustomFieldEntityType.CONTRACT,
        newContract.customFields,
      );
      if (!validation.valid) {
        throw new BadRequestException(validation.errors);
      }
    }

    // ✅ Check user
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // ✅ Check devis
    const devis = await this.devisService.findById(newContract.devisId);
    if (!devis) {
      throw new NotFoundException('Devis not found');
    }
    // ✅ Build title and type in all languages
    const titleFr = `Contrat d'${devis.getTitle('fr')}`;
    const titleEn = `${devis.getTitle('en')} Contract`;
    const titleAr = `عقد ${devis.getTitle('ar')}`;

    const typeFr = `Contrat d'${devis.product.getType('fr')}`;
    const typeEn = `${devis.product.getType('en')} Contract`;
    const typeAr = `عقد ${devis.product.getType('ar')}`;

    // The account mapping (created on first use) and the contract are saved in
    // one transaction: a failure never leaves a mapping without its contract.
    const saved = await this.tenantRepositoryFactory.transaction(async (manager) => {
      const mappings = manager.getRepository(Mapping);
      let mapping = await mappings.findOne({ where: { user: { id: userId } } });
      mapping ??= await mappings.save(
        mappings.create({
          externalAccountId: `ACC-${randomUUID().slice(0, 8).toUpperCase()}`,
          user,
        }),
      );

      const contracts = manager.getRepository(Contract);
      return contracts.save(
        contracts.create({
          titleEn,
          titleFr,
          titleAr,
          typeEn,
          typeFr,
          typeAr,
          startDate: newContract.startDate,
          endDate: newContract.endDate,
          externalAccountId: mapping.externalAccountId,
          user,
          devis,
          customFields: newContract.customFields,
        }),
      );
    });
    await this.cacheService.invalidate(this.cacheNamespace, `user:${userId}`, 'all');
    return saved;
  }

  async getAllContracts(userId: string, language: 'en' | 'fr' | 'ar' = 'fr') {
    const contracts = await this.contractRepository.find({
      where: { user: { id: userId } },
      select: ['id', 'titleEn', 'titleFr', 'titleAr'], // Fetch multilingual fields
    });

    return contracts.map((contract) => ({
      id: contract.id,
      title: contract.getTitle(language),
    }));
  }
  async getContractById(contractId: string, userId: string, language: 'en' | 'fr' | 'ar' = 'fr') {
    const contract = await this.contractRepository.findOne({
      where: { id: contractId, user: { id: userId } },
      relations: ['devis', 'devis.product'],
    });

    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    return {
      id: contract.id,
      title: contract.getTitle(language),
      type: contract.getType(language),
      status: contract.status,
      startDate: contract.startDate,
      endDate: contract.endDate,
      devis: {
        id: contract.devis.id,
        type: contract.devis.product?.getType(language),
        title: contract.devis.getTitle(language),
      },
      externalAccountId: contract.externalAccountId,
    };
  }
}
