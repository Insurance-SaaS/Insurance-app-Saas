import { ApiProperty } from '@nestjs/swagger';

/**
 * Simplified DTO for sinister claims list (used in my-claims endpoint)
 */
export class ClaimSummaryDto {
  @ApiProperty({
    example: 'd5f3c9a1-8b2e-4f6d-9c7a-1e3b5f7d9c2a',
    description: 'Unique sinister ID',
  })
  id: string;

  @ApiProperty({
    example: 'CLM12345678',
    description: 'Unique dossier number',
  })
  numDossier: string;

  @ApiProperty({
    example: 'SUBMITTED',
    description: 'Current status of the claim',
  })
  status: string;

  @ApiProperty({
    example: 'Submitted',
    description: 'Localized status label',
  })
  statusLabel: string;

  @ApiProperty({
    example: 'Accident',
    description: 'Localized type of incident',
  })
  typeIncident: string;

  @ApiProperty({
    example: '2025-10-26',
    description: 'Date when the incident occurred',
  })
  dateIncident: string;

  @ApiProperty({
    example: 'Paris, France',
    description: 'Location where the incident occurred',
  })
  location: string;

  @ApiProperty({
    example: '2025-10-26T14:30:00.000Z',
    description: 'Timestamp when the claim was created',
  })
  createdAt: string;
}
