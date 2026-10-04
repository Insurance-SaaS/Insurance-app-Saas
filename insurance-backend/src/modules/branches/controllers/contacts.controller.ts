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
import { ContactsService } from '../services/contacts.service';
import { CreateContactDto } from '../dtos/create-contact.dto';
import { UpdateContactDto } from '../dtos/update-contact.dto';
import { ContactResponseDto, ContactListResponseDto } from '../dtos/contact-response.dto';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from 'src/modules/users/entities/user.entity';
import { RequiresPlugin } from 'src/core/plugin-registry/decorators/requires-plugin.decorator';

@ApiTags('Contacts')
@RequiresPlugin('@insurance/branches')
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get all contacts',
    description: 'Retrieve a list of all contacts. Requires authentication.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of contacts retrieved successfully',
    type: ContactListResponseDto,
  })
  async findAll(): Promise<ContactListResponseDto> {
    return this.contactsService.findAll();
  }

  @Get('type/:type')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get contacts by type',
    description:
      'Retrieve all contacts of a specific type (phone, email, whatsapp, etc.). Requires authentication.',
  })
  @ApiParam({
    name: 'type',
    description: 'Contact type',
    enum: [
      'phone',
      'email',
      'whatsapp',
      'telegram',
      'skype',
      'viber',
      'instagram',
      'facebook',
      'linkedin',
    ],
    example: 'phone',
  })
  @ApiResponse({
    status: 200,
    description: 'List of contacts by type',
    type: [ContactResponseDto],
  })
  async findByType(@Param('type') type: string): Promise<ContactResponseDto[]> {
    return this.contactsService.findByType(type);
  }

  @Get(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get contact by ID',
    description: 'Retrieve a specific contact by its ID. Requires authentication.',
  })
  @ApiParam({
    name: 'id',
    description: 'Contact ID',
    type: String,
    example: '8b9014f1-f67a-43a7-991f-08ac2a2bb9f4',
  })
  @ApiResponse({
    status: 200,
    description: 'Contact retrieved successfully',
    type: ContactResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Contact not found',
  })
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<ContactResponseDto> {
    return this.contactsService.findById(id);
  }

  @Post()
  @Roles(UserRole.TENANT_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create a new contact (Admin only)',
    description: 'Create a new contact entry. Requires admin authentication.',
  })
  @ApiBody({ type: CreateContactDto })
  @ApiResponse({
    status: 201,
    description: 'Contact created successfully',
    type: ContactResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Contact with this type and value already exists',
  })
  async create(@Body() createContactDto: CreateContactDto): Promise<ContactResponseDto> {
    return this.contactsService.create(createContactDto);
  }

  @Post('bulk')
  @Roles(UserRole.TENANT_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Bulk create contacts (Admin only)',
    description:
      'Create multiple contacts at once (skips existing contacts). Requires admin authentication.',
  })
  @ApiBody({ type: [CreateContactDto] })
  @ApiResponse({
    status: 201,
    description: 'Contacts created successfully',
    schema: {
      type: 'object',
      properties: {
        created: { type: 'number', example: 10 },
        skipped: { type: 'number', example: 2 },
      },
    },
  })
  async bulkCreate(
    @Body() contacts: CreateContactDto[],
  ): Promise<{ created: number; skipped: number }> {
    return this.contactsService.bulkCreate(contacts);
  }

  @Put(':id')
  @Roles(UserRole.TENANT_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update a contact (Admin only)',
    description: 'Update an existing contact by ID. Requires admin authentication.',
  })
  @ApiParam({
    name: 'id',
    description: 'Contact ID',
    type: String,
    example: '8b9014f1-f67a-43a7-991f-08ac2a2bb9f4',
  })
  @ApiBody({ type: UpdateContactDto })
  @ApiResponse({
    status: 200,
    description: 'Contact updated successfully',
    type: ContactResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Contact not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Contact with this type and value already exists',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateContactDto: UpdateContactDto,
  ): Promise<ContactResponseDto> {
    return this.contactsService.update(id, updateContactDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.TENANT_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Delete a contact (Admin only)',
    description: 'Delete a contact by ID. Requires admin authentication.',
  })
  @ApiParam({
    name: 'id',
    description: 'Contact ID',
    type: String,
    example: '8b9014f1-f67a-43a7-991f-08ac2a2bb9f4',
  })
  @ApiResponse({
    status: 204,
    description: 'Contact deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Contact not found',
  })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.contactsService.delete(id);
  }
}
