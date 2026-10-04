/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  Inject,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ExternalServiceException } from 'src/shared/exceptions/business.exception';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Claim, ClaimStatus } from './entities/claim.entity';
import { Document } from './entities/document.entity';
import { Expert } from './entities/expert.entity';

import { CLAIM_LIST_FIELDS, CreateClaimDto } from './dtos/create-claim.dto';
import { ClaimResponseDto } from './dtos/claim-response.dto';

import { IUsersService } from 'src/contracts/interfaces/i-users.service';
import { IStorageService } from 'src/contracts/interfaces/i-storage.service';
import { randomInt, randomUUID } from 'node:crypto';
import { USERS_SERVICE, STORAGE_SERVICE } from 'src/contracts/tokens';
import { LocationValidationService } from 'src/shared/services/location-validation.service';
import { DateValidationService } from 'src/shared/services/date-validation.service';

import { SupportedLanguage } from 'src/shared/utils/multilingual.util';
import { MINIO_BUCKETS } from 'src/shared/constants/minio-buckets';
import { TenantRepositoryFactory } from 'src/core/database/tenant-repository.factory';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { CustomFieldsService } from 'src/core/custom-fields/custom-fields.service';
import { CustomFieldEntityType } from 'src/core/custom-fields/entities/custom-field-definition.entity';
import { UploadedFile } from 'src/shared/types/uploaded-file';
import { ClaimStatusChangedEvent } from 'src/contracts/events/domain-events';
import { assertOwnerOrAdmin, AuthenticatedUser } from 'src/auth/ownership';
import { IClaimsService } from 'src/contracts/interfaces/i-claims.service';
const FIRST_PAGE = { skip: 0, limit: 50 };

/** One line of the "my claims" list. */
export interface ClaimSummary {
  id: string;
  numDossier: string;
  status: ClaimStatus;
  statusLabel: string;
  typeIncident: string;
  dateIncident: string;
  location: string;
  createdAt: string;
}

@Injectable()
export class ClaimsService implements IClaimsService {
  private readonly logger = new Logger(ClaimsService.name);

  private getTenantSlug(): string {
    return this.tenantContext.requireTenant().slug;
  }

  private buildTenantObjectName(objectName: string): string {
    return `${this.getTenantSlug()}/claims/${objectName}`;
  }

  constructor(
    private readonly tenantRepositoryFactory: TenantRepositoryFactory,

    @Inject(USERS_SERVICE)
    private readonly usersService: IUsersService,

    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,


    private readonly configService: ConfigService,

    private readonly locationValidationService: LocationValidationService,

    private readonly dateValidationService: DateValidationService,

    private readonly eventEmitter: EventEmitter2,
    private readonly tenantContext: TenantContextService,
    private readonly customFieldsService: CustomFieldsService,
  ) {}

  private get claimRepository() {
    return this.tenantRepositoryFactory.getRepository(Claim);
  }

  private get documentRepository() {
    return this.tenantRepositoryFactory.getRepository(Document);
  }

  private get expertRepository() {
    return this.tenantRepositoryFactory.getRepository(Expert);
  }

  /**
   * Emit a domain event when claim status changes.
   * Notifications are handled by ClaimNotificationListener (decoupled).
   */
  private emitClaimStatusEvent(
    claim: Claim,
    newStatus: ClaimStatus,
    oldStatus?: ClaimStatus,
  ): void {
    this.eventEmitter.emit(
      ClaimStatusChangedEvent.key,
      new ClaimStatusChangedEvent({
        claimId: claim.id,
        userId: claim.user?.id,
        oldStatus: oldStatus || '',
        newStatus: newStatus,
        numDossier: claim.numDossier,
        expertFullName: claim.expert?.fullName,
        userLanguage: claim.user?.preferredLanguage || 'en',
        tenantSlug: this.getTenantSlug(),
      }),
    );
  }

  /**
   * Replaces the stored location of each document by a link that works for one
   * hour. The stored URL only identifies the object; it is not handed out.
   */
  private async withSignedDocuments<T extends { documents?: { fileUrl: string }[] }>(
    dto: T,
  ): Promise<T> {
    for (const document of dto.documents ?? []) {
      document.fileUrl = (await this.storageService.getSignedUrl(document.fileUrl, 3600)) ?? '';
    }
    return dto;
  }

  private async generateNumDossier(): Promise<string> {
    const prefix = 'CLM';
    const timestamp = Date.now().toString().slice(-5);
    const random = randomInt(1000).toString().padStart(3, '0');

    let numDossier = `${prefix}${timestamp}${random}`;
    let exists = await this.claimRepository.findOne({
      where: { numDossier },
    });

    let counter = 1;
    while (exists) {
      numDossier = `${prefix}${timestamp}${random}${counter}`;
      exists = await this.claimRepository.findOne({ where: { numDossier } });
      counter++;
    }
    return numDossier;
  }

  /**
   * Extract HH:mm time string from a stored timestamp value.
   * The DB column is 'timestamp' but the API returns just "HH:mm".
   */
  private formatTime(time: any): string | undefined {
    if (!time) return undefined;

    if (time instanceof Date) {
      if (Number.isNaN(time.getTime())) return undefined;
      return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
    }

    if (typeof time === 'string') {
      // Already in HH:mm format
      if (/^\d{1,2}:\d{2}$/.test(time)) return time;
      // Try parsing as a date/timestamp
      const parsed = new Date(time);
      if (!Number.isNaN(parsed.getTime())) {
        return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
      }
    }

    return undefined;
  }

  /**
   * Helper function to safely convert date to string
   */
  private formatDate(date: any): string {
    if (!date) return new Date().toISOString().split('T')[0];

    if (date instanceof Date) {
      return date.toISOString().split('T')[0];
    }

    if (typeof date === 'string') {
      const parsedDate = new Date(date);
      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate.toISOString().split('T')[0];
      }
    }

    // Fallback to current date if date is invalid
    this.logger.warn(`Invalid date encountered: ${date}, using current date as fallback`);
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Helper function to safely convert datetime to ISO string
   */
  private formatDateTime(date: any): string {
    if (!date) return new Date().toISOString();

    if (date instanceof Date) {
      return date.toISOString();
    }

    if (typeof date === 'string') {
      const parsedDate = new Date(date);
      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate.toISOString();
      }
    }

    // Fallback to current datetime if date is invalid
    this.logger.warn(`Invalid datetime encountered: ${date}, using current datetime as fallback`);
    return new Date().toISOString();
  }

  private mapToResponseDto(
    sinister: Claim,
    damageDetails?: CreateClaimDto,
    language: SupportedLanguage = 'en',
  ): ClaimResponseDto {
    return {
      id: sinister.id,
      numDossier: sinister.numDossier,
      status: sinister.status,
      statusLabel: sinister.getStatusLabel(language),
      typeIncident: sinister.getTypeIncident(language),
      dateIncident: this.formatDate(sinister.dateIncident),
      timeIncident: this.formatTime(sinister.timeIncident),
      location: sinister.location,
      description: sinister.description || undefined,
      partsEndommagees: sinister.partsEndommagees || damageDetails?.partsEndommagees || [], // ✅ Use persisted value first
      rayures: sinister.damageDetails?.rayures ?? damageDetails?.rayures ?? [],
      bosses: sinister.damageDetails?.bosses ?? damageDetails?.bosses ?? [],
      dommagesPoignee:
        sinister.damageDetails?.dommagesPoignee ?? damageDetails?.dommagesPoignee ?? [],
      documents:
        sinister.documents?.map((doc) => ({
          id: doc.id,
          fileName: doc.fileName,
          contentType: doc.contentType,
          fileUrl: doc.fileUrl,
          createdAt: this.formatDateTime(doc.createdAt),
        })) || [],
      expert: sinister.expert
        ? {
            id: sinister.expert.id,
            fullName: sinister.expert.fullName,
            email: sinister.expert.email,
            phoneNumber: sinister.expert.phoneNumber || undefined,
          }
        : undefined,
      montantApprouve: sinister.montantApprouve ? Number(sinister.montantApprouve) : undefined,
      coutReparation: sinister.coutReparation ? Number(sinister.coutReparation) : undefined,
      coutEvaluation: sinister.coutEvaluation ? Number(sinister.coutEvaluation) : undefined,
      fraisSupplementaires: sinister.fraisSupplementaires
        ? Number(sinister.fraisSupplementaires)
        : undefined,
      customFields: sinister.customFields,
      dateEvaluationEstimee: sinister.dateEvaluationEstimee
        ? this.formatDate(sinister.dateEvaluationEstimee)
        : undefined,
      createdAt: this.formatDateTime(sinister.createdAt),
      updatedAt: this.formatDateTime(sinister.updatedAt),
    };
  }

  /**
   * Validates the declaration form. The text fields of a multipart form arrive
   * as strings (as arrays when a field is repeated); the DTO turns them into the
   * declared types and every problem is reported at once.
   */
  private parseDeclaration(formData: Record<string, unknown>): CreateClaimDto {
    const values: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(formData ?? {})) {
      values[key] = Array.isArray(value) && !CLAIM_LIST_FIELDS.includes(key) ? value[0] : value;
    }

    const dto = plainToInstance(CreateClaimDto, values);
    const errors = validateSync(dto, { whitelist: true });
    if (errors.length > 0) {
      throw new BadRequestException(errors.flatMap((e) => Object.values(e.constraints ?? {})));
    }
    return dto;
  }

  /** Combines the incident date with an "HH:mm" time; other formats are parsed as a timestamp. */
  private incidentTime(dateIncident: Date, time?: string): Date | null {
    if (!time) return null;

    const match = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (match) {
      const value = new Date(dateIncident);
      value.setHours(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10), 0, 0);
      return value;
    }
    const parsed = new Date(time);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  /**
   * The checks a declaration must pass before anything is stored: the date is
   * not in the future, the place exists, the tenant's custom fields are valid.
   * Returns the address as the geocoder writes it.
   */
  private async checkDeclaration(declaration: CreateClaimDto): Promise<string> {
    const date = this.dateValidationService.validateDate(declaration.dateIncident);
    if (!date.isValid || date.isFuture) {
      throw new BadRequestException(
        this.dateValidationService.getDateErrorMessage(declaration.dateIncident, 'en'),
      );
    }

    const place = await this.locationValidationService.validateLocationWithMessage(
      declaration.location,
      'en',
    );
    if (!place.isValid) {
      throw new BadRequestException(
        place.errorMessage ||
          'Please provide a real, existing location (city, address, or specific place).',
      );
    }

    if (declaration.customFields) {
      const validation = await this.customFieldsService.validateCustomFields(
        this.tenantContext.requireTenant().id,
        CustomFieldEntityType.CLAIM,
        declaration.customFields,
      );
      if (!validation.valid) {
        throw new BadRequestException(validation.errors);
      }
    }

    return place.formattedAddress || declaration.location;
  }

  /**
   * Stores the claim and its documents together or not at all. Files go to
   * object storage first; if anything fails the transaction rolls back and the
   * files already stored are removed, so a declaration never ends up half-saved
   * with some of its documents silently missing.
   */
  private async persistDeclaration(claim: Claim, files: UploadedFile[]): Promise<Claim> {
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
    };
    const storedFiles: string[] = [];

    try {
      return await this.tenantRepositoryFactory.transaction(async (manager) => {
        const saved = await manager.getRepository(Claim).save(claim);

        for (const file of files) {
          const objectName = this.buildTenantObjectName(
            `${saved.id}/${randomUUID()}.${extensions[file.mimetype] ?? 'bin'}`,
          );
          let fileUrl: string;
          try {
            fileUrl = await this.storageService.upload(
              MINIO_BUCKETS.CLAIMS,
              objectName,
              file.buffer,
              file.mimetype,
            );
          } catch (error) {
            throw new ExternalServiceException('Storage', 'The documents could not be stored', error);
          }
          storedFiles.push(fileUrl);

          await manager.getRepository(Document).save(
            manager.getRepository(Document).create({
              fileName: file.originalname,
              contentType: file.mimetype,
              fileUrl,
              claim: saved,
            }),
          );
        }
        return saved;
      });
    } catch (error) {
      await Promise.allSettled(storedFiles.map((url) => this.storageService.delete(url)));
      if (this.tenantRepositoryFactory.isUniqueViolation(error)) {
        throw new ConflictException('This claim was already submitted. Please try again.');
      }
      throw error;
    }
  }

  /**
   * Declare a new sinister (incident claim)
   */
  async declareSinister(
    formData: Record<string, unknown>,
    files: UploadedFile[],
    userId: string,
  ): Promise<ClaimResponseDto> {
    const declaration = this.parseDeclaration(formData);

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const location = await this.checkDeclaration(declaration);

    const dateIncident = new Date(declaration.dateIncident);
    const claim = this.claimRepository.create({
      numDossier: await this.generateNumDossier(),
      user,
      // The declared type is free text, stored as is in the three languages.
      typeIncidentEn: declaration.typeIncident,
      typeIncidentFr: declaration.typeIncident,
      typeIncidentAr: declaration.typeIncident,
      dateIncident,
      timeIncident: this.incidentTime(dateIncident, declaration.timeIncident),
      location,
      description: declaration.description,
      partsEndommagees: declaration.partsEndommagees ?? [],
      damageDetails: {
        rayures: declaration.rayures ?? [],
        bosses: declaration.bosses ?? [],
        dommagesPoignee: declaration.dommagesPoignee ?? [],
      },
      status: ClaimStatus.SUBMITTED,
      customFields: declaration.customFields,
    });

    const saved = await this.persistDeclaration(claim, files ?? []);
    const result = await this.claimRepository.findOneOrFail({
      where: { id: saved.id },
      relations: ['user', 'expert', 'documents'],
    });
    this.logger.log(
      `Claim ${result.numDossier} declared with ${result.documents?.length ?? 0} document(s)`,
    );

    const dto = await this.withSignedDocuments(this.mapToResponseDto(result, declaration));
    // Notifications are sent by the listener of this event.
    this.emitClaimStatusEvent(result, ClaimStatus.SUBMITTED);
    return dto;
  }

  async getReclamationStatus(identifier: string, userId: string): Promise<ClaimResponseDto> {
    this.logger.log(`Getting reclamation status for ${identifier}`);

    const numDossier = identifier.startsWith('#') ? identifier.substring(1) : identifier;
    const byNumber = identifier.startsWith('#') || identifier.startsWith('CLM');
    const sinister = await this.claimRepository.findOne({
      where: byNumber ? { numDossier } : { id: identifier },
      relations: ['user', 'expert', 'documents'],
    });

    if (!sinister) throw new NotFoundException('Sinister not found');
    if (sinister.user.id !== userId) {
      throw new NotFoundException('Sinister not found');
    }

    return this.withSignedDocuments(this.mapToResponseDto(sinister));
  }

  async updateSinisterStatus(
    sinisterId: string,
    newStatus: ClaimStatus,
    expertId?: string,
  ): Promise<ClaimResponseDto> {
    const sinister = await this.claimRepository.findOne({
      where: { id: sinisterId },
      relations: ['user', 'expert', 'documents'],
    });
    if (!sinister) throw new NotFoundException('Sinister not found');

    const oldStatus = sinister.status;
    if (oldStatus === newStatus && !expertId) {
      return this.withSignedDocuments(this.mapToResponseDto(sinister));
    }
    sinister.status = newStatus;

    // An expert is only assigned when the claim goes into review.
    if (expertId && newStatus === ClaimStatus.IN_REVIEW) {
      const expert = await this.expertRepository.findOne({ where: { id: expertId } });
      if (!expert) {
        throw new NotFoundException(`Expert with id ${expertId} not found`);
      }
      sinister.expert = expert;
    } else if (expertId) {
      this.logger.warn(`Expert assignment ignored: status is ${newStatus}, not IN_REVIEW`);
    }

    await this.claimRepository.save(sinister);
    this.logger.log(`Claim ${sinisterId} status: ${oldStatus} -> ${newStatus}`);

    const updated = await this.claimRepository.findOneOrFail({
      where: { id: sinisterId },
      relations: ['user', 'expert', 'documents'],
    });
    const dto = await this.withSignedDocuments(this.mapToResponseDto(updated));
    // Notifications are sent by the listener of this event.
    this.emitClaimStatusEvent(updated, newStatus, oldStatus);
    return dto;
  }

  async deleteSinister(sinisterId: string): Promise<void> {
    const sinister = await this.claimRepository.findOne({
      where: { id: sinisterId },
      relations: ['documents'],
    });
    if (!sinister) throw new NotFoundException('Sinister not found');

    const fileUrls = (sinister.documents ?? []).map((document) => document.fileUrl);
    await this.claimRepository.remove(sinister);

    // The rows are gone; a file that cannot be removed is only logged.
    const results = await Promise.allSettled(fileUrls.map((url) => this.storageService.delete(url)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      this.logger.warn(`Claim ${sinister.numDossier}: ${failed} stored file(s) could not be removed`);
    }
    this.logger.log(`Claim ${sinister.numDossier} deleted`);
  }

  async getMyClaims(
    userId: string,
    language: SupportedLanguage = 'en',
    page: { skip: number; limit: number } = FIRST_PAGE,
  ): Promise<{ data: ClaimSummary[]; total: number }> {
    const [claims, total] = await this.claimRepository.findAndCount({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
      skip: page.skip,
      take: page.limit,
    });

    return {
      data: claims.map((claim) => ({
        id: claim.id,
        numDossier: claim.numDossier,
        status: claim.status,
        statusLabel: claim.getStatusLabel(language),
        typeIncident: claim.getTypeIncident(language),
        dateIncident: this.formatDate(claim.dateIncident),
        location: claim.location,
        createdAt: this.formatDateTime(claim.createdAt),
      })),
      total,
    };
  }

  /**
   * @param requester the authenticated user; a claim is only returned to its owner
   *                  or to a tenant admin.
   */
  async getSinisterById(
    id: string,
    language: SupportedLanguage = 'en',
    requester?: AuthenticatedUser,
  ): Promise<any> {
    // Fetch raw entity to access entity methods
    const sinister = await this.claimRepository.findOne({
      where: { id },
      relations: ['expert', 'documents', 'user'],
    });

    if (!sinister) {
      throw new NotFoundException('Sinister not found');
    }
    assertOwnerOrAdmin(requester, sinister.user?.id, 'Sinister');

    // Localize the sinister response
    const localized = {
      id: sinister.id,
      numDossier: sinister.numDossier,
      status: sinister.status,
      statusLabel: sinister.getStatusLabel(language),
      typeIncident: sinister.getTypeIncident(language),
      dateIncident: this.formatDate(sinister.dateIncident),
      timeIncident: this.formatTime(sinister.timeIncident),
      location: sinister.location,
      description: sinister.description,
      partsEndommagees: sinister.partsEndommagees ?? [],
      rayures: sinister.damageDetails?.rayures ?? [],
      bosses: sinister.damageDetails?.bosses ?? [],
      dommagesPoignee: sinister.damageDetails?.dommagesPoignee ?? [],
      montantApprouve: sinister.montantApprouve ? Number(sinister.montantApprouve) : undefined,
      coutReparation: sinister.coutReparation ? Number(sinister.coutReparation) : undefined,
      coutEvaluation: sinister.coutEvaluation ? Number(sinister.coutEvaluation) : undefined,
      fraisSupplementaires: sinister.fraisSupplementaires
        ? Number(sinister.fraisSupplementaires)
        : undefined,
      customFields: sinister.customFields,
      dateEvaluationEstimee: sinister.dateEvaluationEstimee
        ? this.formatDate(sinister.dateEvaluationEstimee)
        : undefined,
      documents: sinister.documents?.map((doc) => ({
        id: doc.id,
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        createdAt: this.formatDateTime(doc.createdAt),
      })),
      expert: sinister.expert
        ? {
            id: sinister.expert.id,
            fullName: sinister.expert.fullName,
            email: sinister.expert.email,
            phoneNumber: sinister.expert.phoneNumber,
          }
        : undefined,
      createdAt: this.formatDateTime(sinister.createdAt),
      updatedAt: this.formatDateTime(sinister.updatedAt),
    };

    return {
      success: true,
      data: await this.withSignedDocuments(localized),
    };
  }
}
