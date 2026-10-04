import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { CreateMappingDto } from './dtos/create-mapping.dto';
import { UpdateMappingDto } from './dtos/update-mapping.dto';
import { TranslationInterceptor } from 'src/translation/interceptors/translation.interceptor';
import { Translatable } from 'src/translation/decorators/translatable.decorator';
import { RequiresPlugin } from 'src/core/plugin-registry/decorators/requires-plugin.decorator';
import { ErpAdapterFactory } from './erp-adapter.factory';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { assertOwnerOrAdmin, AuthenticatedUser } from 'src/auth/ownership';
import { UserRole } from 'src/modules/users/entities/user.entity';

interface AuthenticatedRequest extends FastifyRequest {
  user: AuthenticatedUser;
}

@ApiTags('ERP')
@RequiresPlugin('@insurance/erp')
@Controller('erp/mappings')
@UseInterceptors(TranslationInterceptor)
@ApiBearerAuth()
export class ErpController {
  constructor(private readonly erpAdapterFactory: ErpAdapterFactory) {}

  @Post()
  @Translatable()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new mapping between account and user' })
  @ApiResponse({
    status: 201,
    description: 'Mapping created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Mapping already exists or user is already mapped',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async createMapping(
    @Body() createMappingDto: CreateMappingDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.erpAdapterFactory
      .getAdapter()
      .createMapping(createMappingDto.externalAccountId, req.user.id);
  }

  @Get()
  @Roles(UserRole.TENANT_ADMIN)
  @Translatable()
  @ApiOperation({ summary: 'Get all mappings' })
  @ApiResponse({
    status: 200,
    description: 'Returns all mappings',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  async getAllMappings() {
    return this.erpAdapterFactory.getAdapter().getMappings();
  }

  @Get('account/:externalAccountId')
  @Translatable()
  @ApiOperation({ summary: 'Get mapping by external account ID' })
  @ApiParam({
    name: 'externalAccountId',
    description: 'External Account ID',
    type: String,
    example: 'ACC-12345',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns mapping for the account',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 404,
    description: 'Mapping not found',
  })
  async getMappingByAccount(
    @Param('externalAccountId') externalAccountId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const mapping = await this.erpAdapterFactory.getAdapter().getMappingByAccount(externalAccountId);
    assertOwnerOrAdmin(user, mapping?.user?.id, 'Mapping');
    return mapping;
  }

  @Get('me')
  @Translatable()
  @ApiOperation({ summary: 'Get mapping for the authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Returns mapping for the authenticated user',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 404,
    description: 'Mapping not found',
  })
  async getMyMapping(@Req() req: AuthenticatedRequest) {
    return this.erpAdapterFactory.getAdapter().getMappingByUser(req.user.id);
  }

  @Get('user/:userId')
  @Translatable()
  @ApiOperation({ summary: 'Get mapping by user ID' })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    type: String,
    example: 'usr_abc123xyz',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns mapping for the user',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 404,
    description: 'Mapping not found',
  })
  async getMappingByUser(@Param('userId') userId: string, @CurrentUser() user: AuthenticatedUser) {
    assertOwnerOrAdmin(user, userId, 'Mapping');
    return this.erpAdapterFactory.getAdapter().getMappingByUser(userId);
  }

  @Put(':externalAccountId')
  @Roles(UserRole.TENANT_ADMIN)
  @Translatable()
  @ApiOperation({ summary: 'Update mapping for an account' })
  @ApiParam({
    name: 'externalAccountId',
    description: 'External Account ID',
    type: String,
    example: 'ACC-12345',
  })
  @ApiResponse({
    status: 200,
    description: 'Mapping updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'User is already mapped to another account',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 404,
    description: 'Mapping or user not found',
  })
  async updateMapping(
    @Param('externalAccountId') externalAccountId: string,
    @Body() updateMappingDto: UpdateMappingDto,
  ) {
    // Admin operation: links the account to the user named in the body.
    return this.erpAdapterFactory
      .getAdapter()
      .updateMapping(externalAccountId, updateMappingDto.userId);
  }

  @Delete(':externalAccountId')
  @Translatable()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete mapping by account ID' })
  @ApiParam({
    name: 'externalAccountId',
    description: 'External Account ID',
    type: String,
    example: 'ACC-12345',
  })
  @ApiResponse({
    status: 200,
    description: 'Mapping deleted successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 404,
    description: 'Mapping not found',
  })
  async deleteMapping(
    @Param('externalAccountId') externalAccountId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const adapter = this.erpAdapterFactory.getAdapter();
    const mapping = await adapter.getMappingByAccount(externalAccountId);
    assertOwnerOrAdmin(user, mapping?.user?.id, 'Mapping');
    return adapter.deleteMapping(externalAccountId);
  }
}
