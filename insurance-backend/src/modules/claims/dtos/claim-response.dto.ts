import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DocumentResponseDto {
  @ApiProperty({
    example: 'abc123-def456-ghi789',
    description: 'Document ID',
  })
  id: string;

  @ApiProperty({
    example: 'accident_photo_1.jpg',
    description: 'Original file name',
  })
  fileName: string;

  @ApiPropertyOptional({
    example: 'image/jpeg',
    description: 'MIME type of the file',
  })
  contentType?: string;

  @ApiProperty({
    example: 'https://storage.example.com/sinisters/abc123/accident_photo_1.jpg',
    description: 'URL to access the file',
  })
  fileUrl: string;

  @ApiProperty({
    example: '2025-10-26T14:30:00.000Z',
    description: 'Timestamp when the document record was created',
  })
  createdAt: string;
}

export class ExpertResponseDto {
  @ApiProperty({
    example: 'expert-123',
    description: 'Expert ID',
  })
  id: string;

  @ApiProperty({
    example: 'Jean Dupont',
    description: 'Full name of the expert',
  })
  fullName: string;

  @ApiProperty({
    example: 'jean.dupont@expert.com',
    description: 'Expert email address',
  })
  email: string;

  @ApiPropertyOptional({
    example: '+33 1 23 45 67 89',
    description: 'Expert phone number',
  })
  phoneNumber?: string;
}

export class ClaimResponseDto {
  @ApiProperty({
    example: 'd5f3c9a1-8b2e-4f6d-9c7a-1e3b5f7d9c2a',
    description: 'Unique sinister ID',
  })
  id: string;

  @ApiProperty({
    example: 'CLM12345678',
    description: 'Unique dossier/claim number',
  })
  numDossier: string;

  @ApiProperty({
    example: 'SUBMITTED',
    description: 'Current status of the claim',
  })
  status: string;

  @ApiPropertyOptional({
    example: 'Submitted',
    description: 'Localized status label',
  })
  statusLabel?: string;

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

  @ApiPropertyOptional({
    example: '14:30',
    description: 'Time when the incident occurred',
  })
  timeIncident?: string;

  @ApiProperty({
    example: 'Paris, France',
    description: 'Location where the incident occurred',
  })
  location: string;

  @ApiPropertyOptional({
    example: 'Rear-end collision at traffic light',
    description: 'Detailed description of the incident',
  })
  description?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['Pare-chocs', 'Phares', 'Capot'],
    description: 'List of damaged parts',
  })
  partsEndommagees?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['Portière gauche'],
    description: 'List of scratches',
  })
  rayures?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['Aile arrière droite'],
    description: 'List of dents',
  })
  bosses?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['Poignée de porte conducteur'],
    description: 'List of handle damages',
  })
  dommagesPoignee?: string[];

  @ApiPropertyOptional({
    type: [DocumentResponseDto],
    description: 'List of uploaded documents',
  })
  documents?: DocumentResponseDto[];

  @ApiPropertyOptional({
    type: Object,
    description: 'Tenant-defined custom fields payload',
  })
  customFields?: Record<string, unknown>;

  @ApiPropertyOptional({
    type: () => ExpertResponseDto,
    description: 'Assigned expert information',
  })
  expert?: ExpertResponseDto;

  @ApiPropertyOptional({
    example: 5000.0,
    description: 'Approved compensation amount',
  })
  montantApprouve?: number;

  @ApiPropertyOptional({
    example: 3500.0,
    description: 'Repair cost',
  })
  coutReparation?: number;

  @ApiPropertyOptional({
    example: 500.0,
    description: 'Evaluation cost',
  })
  coutEvaluation?: number;

  @ApiPropertyOptional({
    example: 200.0,
    description: 'Additional fees',
  })
  fraisSupplementaires?: number;

  @ApiPropertyOptional({
    example: '2025-11-05',
    description: 'Estimated evaluation date',
  })
  dateEvaluationEstimee?: string;
  @ApiProperty({
    example: '2025-10-26T14:30:00.000Z',
    description: 'Timestamp when the sinister was created',
  })
  createdAt: string;
  @ApiProperty({
    example: '2025-10-26T15:45:00.000Z',
    description: 'Timestamp when the sinister was last updated',
  })
  updatedAt: string;
}
