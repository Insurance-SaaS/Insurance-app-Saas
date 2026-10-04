import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { BranchesService } from '../services/branches.service';
import { CreateBranchDto } from '../dtos/create-branch.dto';
import { UpdateBranchDto } from '../dtos/update-branch.dto';
import {
  BranchResponseDto,
  BranchListResponseDto,
  MapBranchDto,
} from '../dtos/branch-response.dto';
import { RequiresPlugin } from 'src/core/plugin-registry/decorators/requires-plugin.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from 'src/modules/users/entities/user.entity';
import { Public } from 'src/auth/decorators/public.decorator';

@ApiTags('Branches')
@RequiresPlugin('@insurance/branches')
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Get all branches',
    description: 'Retrieve a list of all insurance branches',
  })
  @ApiResponse({
    status: 200,
    description: 'List of branches retrieved successfully',
    type: BranchListResponseDto,
  })
  async findAll(): Promise<BranchListResponseDto> {
    return this.branchesService.findAll();
  }

  @Public()
  @Get('map')
  @ApiOperation({
    summary: 'Get branches for map display',
    description: 'Retrieve all branches that have valid coordinates for displaying on Algeria map',
  })
  @ApiResponse({
    status: 200,
    description: 'List of branches with coordinates',
    type: [MapBranchDto],
  })
  async findForMap(): Promise<MapBranchDto[]> {
    return this.branchesService.findForMap();
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Get branch by ID',
    description: 'Retrieve a specific branch by its ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Branch ID',
    type: String,
    example: '8b9014f1-f67a-43a7-991f-08ac2a2bb9f4',
  })
  @ApiResponse({
    status: 200,
    description: 'Branch retrieved successfully',
    type: BranchResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Branch not found',
  })
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<BranchResponseDto> {
    return this.branchesService.findById(id);
  }

  @Public()
  @Get('code/:code')
  @ApiOperation({
    summary: 'Get branch by code',
    description: 'Retrieve a specific branch by its unique code',
  })
  @ApiParam({
    name: 'code',
    description: 'Branch code',
    type: String,
    example: '5087',
  })
  @ApiResponse({
    status: 200,
    description: 'Branch retrieved successfully',
    type: BranchResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Branch not found',
  })
  async findByCode(@Param('code') code: string): Promise<BranchResponseDto> {
    return this.branchesService.findByCode(code);
  }

  @Post()
  @Roles(UserRole.TENANT_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create a new branch (Admin only)',
    description: 'Create a new insurance branch. Requires admin authentication.',
  })
  @ApiBody({ type: CreateBranchDto })
  @ApiResponse({
    status: 201,
    description: 'Branch created successfully',
    type: BranchResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Branch with this code already exists',
  })
  async create(@Body() createBranchDto: CreateBranchDto): Promise<BranchResponseDto> {
    return this.branchesService.create(createBranchDto);
  }

  @Post('bulk')
  @Roles(UserRole.TENANT_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Bulk create branches (Admin only)',
    description:
      'Create multiple branches at once (skips existing codes). Requires admin authentication.',
  })
  @ApiBody({ type: [CreateBranchDto] })
  @ApiResponse({
    status: 201,
    description: 'Branches created successfully',
    schema: {
      type: 'object',
      properties: {
        created: { type: 'number', example: 340 },
        skipped: { type: 'number', example: 2 },
      },
    },
  })
  async bulkCreate(
    @Body() branches: CreateBranchDto[],
  ): Promise<{ created: number; skipped: number }> {
    return this.branchesService.bulkCreate(branches);
  }

  @Put(':id')
  @Roles(UserRole.TENANT_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update a branch (Admin only)',
    description: 'Update an existing branch by ID. Requires admin authentication.',
  })
  @ApiParam({
    name: 'id',
    description: 'Branch ID',
    type: String,
    example: '8b9014f1-f67a-43a7-991f-08ac2a2bb9f4',
  })
  @ApiBody({ type: UpdateBranchDto })
  @ApiResponse({
    status: 200,
    description: 'Branch updated successfully',
    type: BranchResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Branch not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Branch with this code already exists',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateBranchDto: UpdateBranchDto,
  ): Promise<BranchResponseDto> {
    return this.branchesService.update(id, updateBranchDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.TENANT_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Delete a branch (Admin only)',
    description: 'Delete a branch by ID. Requires admin authentication.',
  })
  @ApiParam({
    name: 'id',
    description: 'Branch ID',
    type: String,
    example: '8b9014f1-f67a-43a7-991f-08ac2a2bb9f4',
  })
  @ApiResponse({
    status: 204,
    description: 'Branch deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Branch not found',
  })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.branchesService.delete(id);
  }
}
