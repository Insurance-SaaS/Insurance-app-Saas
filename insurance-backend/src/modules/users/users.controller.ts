import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UploadedFile,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Delete,
  Req,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { UploadedFile as IUploadedFile } from 'src/shared/types/uploaded-file';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import {
  ErrorResponseDto,
  NotFoundErrorResponseDto,
  ValidationErrorResponseDto,
  InternalServerErrorResponseDto,
} from 'src/shared/dtos/error-response.dto';
import { UsersService } from './users.service';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { User } from './entities/user.entity';
import { AppLogger } from 'src/shared/logger/app-logger.service';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from 'src/modules/users/entities/user.entity';
import { readMultipart } from 'src/shared/uploads/multipart-reader';

@ApiTags('Users')
@Controller('users')
@Roles(UserRole.TENANT_ADMIN)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly logger: AppLogger,
  ) {}
  @Get()
  @ApiOperation({ summary: 'Get all users (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'List of all users retrieved successfully',
    type: [User],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized', type: ErrorResponseDto })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions. Admin role required',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  async getAllUsers() {
    try {
      return await this.usersService.findAll();
    } catch (error) {
      this.logger.error('Error getting all users:', error.message);
      throw new InternalServerErrorException(
        `Failed to get users: ${error.message || 'Unknown error occurred'}`,
      );
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID (Admin only)' })
  @ApiParam({ name: 'id', type: 'string', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User retrieved successfully',
    type: User,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized', type: ErrorResponseDto })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions. Admin role required',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found', type: NotFoundErrorResponseDto })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  async getUserById(@Param('id') id: string) {
    try {
      const user = await this.usersService.findById(id);
      if (!user) {
        throw new NotFoundException('User not found');
      }
      return user;
    } catch (error) {
      this.logger.error(`Error getting user ${id}:`, error.message);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to get user: ${error.message || 'Unknown error occurred'}`,
      );
    }
  }

  @Get('email/:email')
  @ApiOperation({ summary: 'Get user by email (Admin only)' })
  @ApiParam({ name: 'email', type: 'string', description: 'User email' })
  @ApiResponse({
    status: 200,
    description: 'User retrieved successfully',
    type: User,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions. Admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserByEmail(@Param('email') email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  @Get('phone/:phone')
  @ApiOperation({ summary: 'Get user by phone (Admin only)' })
  @ApiParam({ name: 'phone', type: 'string', description: 'User phone number' })
  @ApiResponse({
    status: 200,
    description: 'User retrieved successfully',
    type: User,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions. Admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserByPhone(@Param('phone') phone: string) {
    const user = await this.usersService.findByPhone(phone);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  @Post()
  @ApiOperation({ summary: 'Create new user (Admin only)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        email: { type: 'string' },
        password: { type: 'string' },
        phone: { type: 'string' },
        role: { type: 'string', enum: ['user', 'tenant_admin'] },
        customFields: { type: 'object' },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Profile picture (optional)',
        },
      },
      required: ['username', 'email', 'password'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    type: User,
  })
  @ApiResponse({ status: 400, description: 'Bad request', type: ValidationErrorResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized', type: ErrorResponseDto })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions. Admin role required',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Email or phone already in use',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  @HttpCode(HttpStatus.CREATED)
  async createUser(@Body() createUserDto: CreateUserDto, @UploadedFile() file?: IUploadedFile) {
    try {
      return await this.usersService.createUser(createUserDto, file);
    } catch (error) {
      this.logger.error('Error creating user:', error.message);
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to create user: ${error.message || 'Unknown error occurred'}`,
      );
    }
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user by ID (Admin only)' })
  @ApiParam({ name: 'id', type: 'string', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions. Admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Phone number already in use' })
  async updateUser(@Param('id') id: string, @Body() updateDto: UpdateUserDto) {
    return this.usersService.updateUser(id, updateDto);
  }

  @Patch(':id/photo')
  @ApiOperation({ summary: 'Update user profile picture (Admin only)' })
  @ApiParam({ name: 'id', type: 'string', description: 'User ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Profile picture updated successfully',
  })
  @ApiResponse({ status: 400, description: 'No picture provided' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions. Admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUserPhoto(@Param('id') id: string, @Req() req: any) {
    const { files } = await readMultipart(req, {
      fileFields: ['file', 'picture', 'photo', 'image'],
      maxFiles: 1,
      accept: 'images',
    });
    if (files.length === 0) {
      throw new BadRequestException('No picture uploaded');
    }
    return this.usersService.updatePhoto(id, files[0]);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Reset user password (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions. Admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.usersService.forgotPassword(forgotPasswordDto.email, forgotPasswordDto.newPassword);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Delete user by ID (Admin only)' })
  @ApiParam({ name: 'id', type: 'string', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User deleted successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions. Admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }
}
