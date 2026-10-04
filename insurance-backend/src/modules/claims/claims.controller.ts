import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseInterceptors,
  Request,
  HttpStatus,
  BadRequestException,
  Logger,
  Query,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import {
  ErrorResponseDto,
  ValidationErrorResponseDto,
  NotFoundErrorResponseDto,
  InternalServerErrorResponseDto,
} from 'src/shared/dtos/error-response.dto';
import { ClaimsService } from './claims.service';
import { DeclareClaimResponseDto } from './dtos/declare-claim-response.dto';
import { MyClaimsResponseDto } from './dtos/myclaims-response-dto';
import { ClaimByIdResponseDto } from './dtos/claim-by-id-response.dto';
import { UpdateClaimStatusDto } from './dtos/update-claim-status.dto';
import {
  LanguageInterceptor,
  RequestWithLanguage,
} from 'src/shared/interceptors/language.interceptor';
import { RequiresPlugin } from 'src/core/plugin-registry/decorators/requires-plugin.decorator';

import { LocationValidationService } from 'src/shared/services/location-validation.service';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from 'src/modules/users/entities/user.entity';
import { readMultipart } from 'src/shared/uploads/multipart-reader';
import { PageQueryDto } from 'src/shared/dtos/page-query.dto';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from 'src/auth/ownership';

const LOCATION_MESSAGES: Record<
  string,
  { required: string; notFound: (location: string) => string; valid: string }
> = {
  fr: {
    required: 'Le champ "location" est requis.',
    notFound: (location) => `L'adresse "${location}" est invalide ou introuvable.`,
    valid: 'Adresse validée avec succès.',
  },
  ar: {
    required: 'حقل "الموقع" مطلوب.',
    notFound: (location) => `العنوان "${location}" غير صالح أو غير موجود.`,
    valid: 'تم التحقق من العنوان بنجاح.',
  },
  en: {
    required: 'The "location" field is required.',
    notFound: (location) => `The address "${location}" is invalid or not found.`,
    valid: 'Location validated successfully.',
  },
};

@ApiTags('Claims')
@ApiBearerAuth()
@UseInterceptors(LanguageInterceptor)
@RequiresPlugin('@insurance/claims')
@Controller('claims')
export class ClaimsController {
  constructor(
    private readonly claimsService: ClaimsService,
    private readonly locationValidationService: LocationValidationService,
  ) {}

  private readonly logger = new Logger(ClaimsController.name);

  /**
   * POST /sinisters/declare - Declare a new sinister with Fastify multipart
   * Returns: Complete sinister details including createdAt timestamp
   */
  @Post('declare')
  @ApiOperation({
    summary: 'Declare a new sinister',
    description:
      'Submit a new insurance claim with files and form data using Fastify multipart processing. Returns sinister details with createdAt timestamp.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 200,
    description: 'Sinister declared successfully with creation timestamp',
    type: DeclareClaimResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data or multipart processing error',
    type: ValidationErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  @ApiBody({
    description: 'Multipart form data with sinister information and optional files',
    schema: {
      type: 'object',
      properties: {
        // Form fields - adjust according to your claim create DTO
        description: {
          type: 'string',
          description: 'Description of the incident',
        },
        dateIncident: {
          type: 'string',
          format: 'date',
          description: 'Date when the incident occurred',
        },
        lieuIncident: {
          type: 'string',
          description: 'Location where the incident occurred',
        },
        typeIncident: {
          type: 'string',
          description: 'Type of incident',
        },
        // File upload fields
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description: 'Supporting documents/images (max 5MB each)',
        },
      },
      required: ['description', 'dateIncident', 'lieuIncident'],
    },
  })
  async declareSinister(@Request() req: any): Promise<DeclareClaimResponseDto> {
    // Up to 10 photos or PDF documents; type and size are checked while reading.
    const { fields, files } = await readMultipart(req, {
      fileFields: ['files', 'images', 'documents'],
      maxFiles: 10,
      accept: 'images-and-pdf',
    });
    if (Object.keys(fields).length === 0) {
      throw new BadRequestException('Form data is required');
    }

    const result = await this.claimsService.declareSinister(fields, files, req.user.id);

    return {
      success: true,
      message: `Votre réclamation a été déposée ! Numéro de référence: #${result.numDossier}`,
      data: result,
    };
  }

  @Get('my-claims')
  @ApiOperation({
    summary: 'Get all claims for the authenticated user (includes createdAt timestamp)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of sinister claims for the authenticated user with creation timestamps',
    type: MyClaimsResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Invalid or missing JWT token',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  async getMyClaims(
    @Request() req: RequestWithLanguage,
    @CurrentUser() user: AuthenticatedUser,
    @Query() page: PageQueryDto,
  ): Promise<MyClaimsResponseDto> {
    const result = await this.claimsService.getMyClaims(user.id, req.language || 'en', page);

    return { success: true, ...result, page: page.page, limit: page.limit };
  }

  /**
   * PATCH /sinisters/:id/status - Update sinister status (Admin only)
   * Returns: Updated sinister details
   */
  @Patch(':id/status')
  @Roles(UserRole.TENANT_ADMIN)
  @ApiOperation({
    summary: 'Update sinister status (Admin only)',
    description: 'Update the status of a sinister claim. Requires admin privileges.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique sinister ID (UUID)',
    type: String,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Sinister status updated successfully',
    type: ClaimByIdResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Sinister not found',
    type: NotFoundErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - Admin privileges required',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Invalid or missing JWT token',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid request data',
    type: ValidationErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  async updateSinisterStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateClaimStatusDto,
    @Request() req: RequestWithLanguage,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ClaimByIdResponseDto> {
    await this.claimsService.updateSinisterStatus(id, updateDto.status, updateDto.expertId);
    this.logger.log(`Admin ${user.id} set claim ${id} to ${updateDto.status}`);

    // Same response as GET /claims/:id, in the caller's language.
    return this.claimsService.getSinisterById(id, req.language || 'en', user);
  }

  /**
   * DELETE /sinisters/:id - Delete sinister (Admin only)
   * Permanently deletes a sinister and all associated documents
   */
  @Delete(':id')
  @Roles(UserRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete sinister (Admin only)',
    description:
      'Permanently delete a sinister claim and all associated documents. This action cannot be undone. Requires admin privileges.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique sinister ID (UUID)',
    type: String,
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Sinister deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Sinister not found',
    type: NotFoundErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - Admin privileges required',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Invalid or missing JWT token',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  async deleteSinister(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.claimsService.deleteSinister(id);
    this.logger.log(`Admin ${user.id} deleted claim ${id}`);
  }

  /**
   * GET /sinisters/:id - Get sinister by ID
   * Returns: Complete sinister details including createdAt and updatedAt timestamps
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get sinister details by ID (includes createdAt and updatedAt timestamps)',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique sinister ID (UUID)',
    type: String,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Sinister details retrieved successfully with timestamps',
    type: ClaimByIdResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Sinister not found',
    type: NotFoundErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - Invalid or missing JWT token',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  async getSinisterById(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequestWithLanguage,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ClaimByIdResponseDto> {
    return this.claimsService.getSinisterById(id, req.language || 'en', user);
  }

  @Post('validate-location')
  @ApiOperation({
    summary: 'Validate a location string',
    description:
      'Checks if a location exists using the backend validation service (Google Maps or OpenStreetMap).',
  })
  @ApiResponse({
    status: 200,
    description: 'Validation result',
    // Define or import a DTO for the response structure if needed, e.g., ValidateLocationResponseDto
    // type: ValidateLocationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input parameters',
    type: ValidationErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  async validateLocation(
    @Body('location') location: string,
    @Query('lang') lang: 'fr' | 'ar' | 'en' = 'fr',
  ): Promise<any> {
    const text = LOCATION_MESSAGES[lang] ?? LOCATION_MESSAGES.en;
    if (!location || typeof location !== 'string') {
      throw new BadRequestException(text.required);
    }

    const validationResult = await this.locationValidationService.validateLocationWithMessage(
      location,
      lang,
    );
    if (!validationResult.isValid) {
      throw new BadRequestException(text.notFound(location));
    }

    return { message: text.valid, data: validationResult };
  }
}
