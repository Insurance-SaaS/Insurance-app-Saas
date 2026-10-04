import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { SUPPORTED_ENGINES } from 'src/core/database/dialects';
import { TENANT_SLUG_INPUT } from '../tenant-slug';

export class CreateTenantDto {
  @ApiProperty({ example: 'acme' })
  @IsString()
  @IsNotEmpty()
  @Matches(TENANT_SLUG_INPUT, {
    message: 'slug may contain letters, digits, "-" and "_" (at most 63 characters)',
  })
  slug: string;

  @ApiProperty({ example: 'Acme Insurance' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @ApiPropertyOptional({ example: 'oracle', enum: SUPPORTED_ENGINES })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_ENGINES)
  databaseType?: string;

  @ApiPropertyOptional({
    enum: ['managed', 'byod'],
    description:
      "'byod': the tenant brings an existing empty database (give its connection details). " +
      "'managed': the platform creates the database on its own server. " +
      'Defaults to byod when a databaseHost is given, managed otherwise.',
  })
  @IsOptional()
  @IsIn(['managed', 'byod'])
  provisioningMode?: 'managed' | 'byod';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  databaseHost?: string;

  @ApiPropertyOptional({ example: 1521 })
  @IsOptional()
  @IsInt()
  @Min(1)
  databasePort?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  databaseName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  databaseUsername?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  databasePassword?: string;

  @ApiPropertyOptional({
    type: Object,
    description: 'Engine-specific connection extras, e.g. { "sid": "XE" } or { "ssl": true }',
  })
  @IsOptional()
  @IsObject()
  databaseOptions?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
