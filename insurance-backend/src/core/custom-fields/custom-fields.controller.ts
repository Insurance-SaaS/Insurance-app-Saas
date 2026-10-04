import {
  BadRequestException,
  Body,
  NotFoundException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CustomFieldsService } from './custom-fields.service';
import { CreateCustomFieldDefinitionDto } from './dtos/create-custom-field-definition.dto';
import { UpdateCustomFieldDefinitionDto } from './dtos/update-custom-field-definition.dto';
import { CustomFieldEntityType } from './entities/custom-field-definition.entity';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from 'src/modules/users/entities/user.entity';

@Controller()
export class CustomFieldsController {
  constructor(
    private readonly customFieldsService: CustomFieldsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** The :tenantId in the path must be the tenant the caller is authenticated against. */
  private assertOwnTenant(tenantId: string): void {
    if (this.tenantContext.getTenant()?.id !== tenantId) {
      throw new NotFoundException('Tenant not found');
    }
  }

  @Get('custom-fields')
  async getCurrentTenantDefinitions(@Query('entityType') entityType: CustomFieldEntityType) {
    const tenant = this.tenantContext.getTenant();
    if (!tenant) {
      throw new BadRequestException('Tenant context is required');
    }
    if (!entityType) {
      throw new BadRequestException('entityType is required');
    }

    return this.customFieldsService.getDefinitions(tenant.id, entityType);
  }

  @Get('platform/tenants/:tenantId/custom-fields')
  @Roles(UserRole.TENANT_ADMIN)
  async getPlatformDefinitions(
    @Param('tenantId') tenantId: string,
    @Query('entityType') entityType: CustomFieldEntityType,
  ) {
    this.assertOwnTenant(tenantId);
    if (!entityType) {
      throw new BadRequestException('entityType is required');
    }

    return this.customFieldsService.getDefinitions(tenantId, entityType);
  }

  @Post('platform/tenants/:tenantId/custom-fields')
  @Roles(UserRole.TENANT_ADMIN)
  async createDefinition(
    @Param('tenantId') tenantId: string,
    @Body() body: CreateCustomFieldDefinitionDto,
  ) {
    this.assertOwnTenant(tenantId);
    return this.customFieldsService.createDefinition(tenantId, body);
  }

  @Patch('platform/tenants/:tenantId/custom-fields/:id')
  @Roles(UserRole.TENANT_ADMIN)
  async updateDefinition(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateCustomFieldDefinitionDto,
  ) {
    this.assertOwnTenant(tenantId);
    return this.customFieldsService.updateDefinition(tenantId, id, body);
  }

  @Delete('platform/tenants/:tenantId/custom-fields/:id')
  @Roles(UserRole.TENANT_ADMIN)
  async deleteDefinition(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    this.assertOwnTenant(tenantId);
    await this.customFieldsService.deleteDefinition(tenantId, id);
    return { success: true };
  }
}
