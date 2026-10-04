import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** The fields of the declaration form that hold a list of values. */
export const CLAIM_LIST_FIELDS = ['partsEndommagees', 'rayures', 'bosses', 'dommagesPoignee'];

/**
 * A multipart form sends a list as a repeated field, as a JSON array in one
 * field, or as a single plain value. Anything else is left as it is, so the
 * validation reports it instead of the value being dropped silently.
 */
function toList({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === '') return [];
  if (typeof value !== 'string') return value;

  const text = value.trim();
  if (!text.startsWith('[')) return [text];
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

function toObject({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const List = () => (target: object, property: string) => {
  IsOptional()(target, property);
  Transform(toList)(target, property);
  IsArray()(target, property);
  ArrayMaxSize(50)(target, property);
  IsString({ each: true })(target, property);
  MaxLength(100, { each: true })(target, property);
};

/**
 * The claim declaration form. The "not in the future" rule is not checked here
 * but in ClaimsService, which knows the tenant's time zone.
 */
export class CreateClaimDto {
  @ApiProperty({
    example: 'Accident',
    description: 'Type of incident (Accident, Vol, Feu, etc.)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  typeIncident: string;

  @ApiProperty({
    example: '2025-09-27',
    description: 'Date of the incident (ISO 8601 format, e.g., YYYY-MM-DD)',
  })
  @IsDateString(
    {},
    { message: 'dateIncident must be a valid ISO 8601 date string (e.g., YYYY-MM-DD)' },
  )
  @IsNotEmpty()
  dateIncident: string;

  @ApiPropertyOptional({
    example: '13:59',
    description: 'Time of the incident (HH:mm)',
  })
  @IsString()
  @MaxLength(40)
  @IsOptional()
  timeIncident?: string;

  @ApiProperty({
    example: 'Claire Dupont, 18 Rue des Lilas, 75020 Paris, France',
    description: 'Location of the incident',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  location: string;

  @ApiPropertyOptional({
    example: 'Rear-end collision at a traffic light',
    description: 'Brief description of the incident',
  })
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [String], example: ['Pare-chocs', 'Phares', 'Capot'] })
  @List()
  partsEndommagees?: string[];

  @ApiPropertyOptional({ type: [String], example: ['Portière gauche', 'Capot'] })
  @List()
  rayures?: string[];

  @ApiPropertyOptional({ type: [String], example: ['Aile arrière droite'] })
  @List()
  bosses?: string[];

  @ApiPropertyOptional({ type: [String], example: ['Poignée de porte conducteur'] })
  @List()
  dommagesPoignee?: string[];

  @ApiPropertyOptional({
    type: Object,
    example: { vehicle_info: 'Toyota Yaris 2019', priority_level: 'high' },
    description: 'Tenant-defined custom fields payload (a JSON object)',
  })
  @IsOptional()
  @Transform(toObject)
  @IsObject({ message: 'customFields must be a JSON object' })
  customFields?: Record<string, unknown>;
}
