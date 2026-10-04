import type { ClaimResponseDto } from 'src/modules/claims/dtos/claim-response.dto';
import { UploadedFile } from 'src/shared/types/uploaded-file';

/**
 * What other modules may ask of the claims module (used by the AI assistant).
 * The types are imported as types only: there is no runtime dependency on the
 * claims module.
 */
export interface IClaimsService {
  /** Creates a claim for the user, with optional file attachments. */
  declareSinister(
    formData: Record<string, any>,
    files: UploadedFile[],
    userId: string,
  ): Promise<ClaimResponseDto>;

  /** A claim by id or dossier number; only if it belongs to the user. */
  getReclamationStatus(identifier: string, userId: string): Promise<ClaimResponseDto>;
}
