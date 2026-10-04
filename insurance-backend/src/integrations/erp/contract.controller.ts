import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { CreateContractDto } from './dtos/create-contract.dto';
import { ContractDetailsDto, ContractSummaryDto } from './dtos/contract-response.dto';
import { TranslationInterceptor } from 'src/translation/interceptors/translation.interceptor';
import { Translatable } from 'src/translation/decorators/translatable.decorator';
import { ErpAdapterFactory } from './erp-adapter.factory';
import { RequiresPlugin } from 'src/core/plugin-registry/decorators/requires-plugin.decorator';

interface AuthenticatedUser {
  id: string;
  email: string;
  provider?: string;
  roles?: string[];
  isActive?: boolean;
}

interface AuthenticatedRequest extends FastifyRequest {
  user: AuthenticatedUser;
}

@ApiTags('Contracts')
@RequiresPlugin('@insurance/erp')
@Controller('contract')
@UseInterceptors(TranslationInterceptor)
@ApiBearerAuth()
export class ContractController {
  constructor(private readonly erpAdapterFactory: ErpAdapterFactory) {}

  // ✅ Create a contract
  @Post()
  @Translatable()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new contract' })
  @ApiResponse({ status: 201, description: 'Contract created successfully' })
  @ApiResponse({ status: 404, description: 'User or Devis not found' })
  async createContract(@Body() dto: CreateContractDto, @Req() req: AuthenticatedRequest) {
    return this.erpAdapterFactory.getAdapter().createContract(dto, req.user.id);
  }

  // ✅ Get all contracts for the authenticated user
  @Get()
  @Translatable()
  @ApiOperation({ summary: 'Get all contracts for the authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'List of contracts (id + title)',
    type: [ContractSummaryDto],
  })
  async getAllContracts(@Req() req: AuthenticatedRequest) {
    return this.erpAdapterFactory.getAdapter().getAllContracts(req.user.id);
  }

  @Get(':id')
  @Translatable()
  @ApiOperation({ summary: 'Get details of a contract' })
  @ApiParam({ name: 'id', description: 'Contract ID', type: String })
  @ApiResponse({
    status: 200,
    description: 'Contract details',
    type: ContractDetailsDto,
  })
  @ApiResponse({ status: 404, description: 'Contract not found' })
  async getContractById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.erpAdapterFactory.getAdapter().getContractById(id, req.user.id);
  }
}
