import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { IsNull, Not } from 'typeorm';
import { Branch } from '../entities/branch.entity';
import { CreateBranchDto } from '../dtos/create-branch.dto';
import { UpdateBranchDto } from '../dtos/update-branch.dto';
import { TenantRepositoryFactory } from 'src/core/database/tenant-repository.factory';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { CustomFieldsService } from 'src/core/custom-fields/custom-fields.service';
import { CustomFieldEntityType } from 'src/core/custom-fields/entities/custom-field-definition.entity';

@Injectable()
export class BranchesService {
  constructor(
    private readonly tenantRepositoryFactory: TenantRepositoryFactory,
    private readonly tenantContext: TenantContextService,
    private readonly customFieldsService: CustomFieldsService,
  ) {}

  private get branchRepository() {
    return this.tenantRepositoryFactory.getRepository(Branch);
  }

  async findAll(): Promise<{ data: Branch[]; total: number }> {
    const [data, total] = await this.branchRepository.findAndCount({
      order: { code: 'ASC' },
    });
    return { data, total };
  }

  async findById(id: string): Promise<Branch> {
    const branch = await this.branchRepository.findOne({ where: { id } });
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${id} not found`);
    }
    return branch;
  }

  async findByCode(code: string): Promise<Branch> {
    const branch = await this.branchRepository.findOne({ where: { code } });
    if (!branch) {
      throw new NotFoundException(`Branch with code ${code} not found`);
    }
    return branch;
  }

  async findForMap(): Promise<Branch[]> {
    return this.branchRepository.find({
      where: {
        latitude: Not(IsNull()),
        longitude: Not(IsNull()),
      },
      order: { code: 'ASC' },
    });
  }

  async create(createBranchDto: CreateBranchDto): Promise<Branch> {
    if (createBranchDto.customFields) {
      const tenant = this.tenantContext.getTenant();
      if (!tenant) {
        throw new BadRequestException('Tenant context is required for custom fields');
      }
      const validation = await this.customFieldsService.validateCustomFields(
        tenant.id,
        CustomFieldEntityType.BRANCH,
        createBranchDto.customFields,
      );
      if (!validation.valid) {
        throw new BadRequestException(validation.errors);
      }
    }

    const existingBranch = await this.branchRepository.findOne({
      where: { code: createBranchDto.code },
    });

    if (existingBranch) {
      throw new ConflictException(`Branch with code ${createBranchDto.code} already exists`);
    }

    const branch = this.branchRepository.create(createBranchDto);
    return this.branchRepository.save(branch);
  }

  async update(id: string, updateBranchDto: UpdateBranchDto): Promise<Branch> {
    const branch = await this.findById(id);
    if (updateBranchDto.customFields) {
      const tenant = this.tenantContext.getTenant();
      if (!tenant) {
        throw new BadRequestException('Tenant context is required for custom fields');
      }
      const validation = await this.customFieldsService.validateCustomFields(
        tenant.id,
        CustomFieldEntityType.BRANCH,
        updateBranchDto.customFields,
      );
      if (!validation.valid) {
        throw new BadRequestException(validation.errors);
      }
    }


    if (updateBranchDto.code && updateBranchDto.code !== branch.code) {
      const existingBranch = await this.branchRepository.findOne({
        where: { code: updateBranchDto.code },
      });
      if (existingBranch) {
        throw new ConflictException(`Branch with code ${updateBranchDto.code} already exists`);
      }
    }

    Object.assign(branch, updateBranchDto);
    return this.branchRepository.save(branch);
  }

  async delete(id: string): Promise<void> {
    const branch = await this.findById(id);
    await this.branchRepository.remove(branch);
  }

  async bulkCreate(branches: CreateBranchDto[]): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    // Process in batches of 50 for better performance
    const batchSize = 50;
    for (let i = 0; i < branches.length; i += batchSize) {
      const batch = branches.slice(i, i + batchSize);
      const existingCodes = await this.branchRepository.find({
        where: batch.map((b) => ({ code: b.code })),
        select: ['code'],
      });
      const existingCodeSet = new Set(existingCodes.map((b) => b.code));

      const toCreate = batch.filter((b) => !existingCodeSet.has(b.code));
      const toSkip = batch.filter((b) => existingCodeSet.has(b.code));

      if (toCreate.length > 0) {
        const branchesToSave = this.branchRepository.create(toCreate);
        await this.branchRepository.save(branchesToSave);
        created += toCreate.length;
      }

      skipped += toSkip.length;

      // Progress logging every batch
      if ((i + batchSize) % 100 === 0 || i + batchSize >= branches.length) {
        console.log(
          `   Progress: ${Math.min(i + batchSize, branches.length)}/${branches.length} processed...`,
        );
      }
    }

    return { created, skipped };
  }
}
