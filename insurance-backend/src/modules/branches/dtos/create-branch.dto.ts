import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, Min, Max, IsObject } from 'class-validator';
import { BranchType } from '../entities/branch.entity';

export class CreateBranchDto {
  @ApiProperty({
    description: 'Unique branch code',
    example: '5087',
  })
  @IsString()
  @IsNotEmpty({ message: 'Branch code is required' })
  code: string;

  @ApiProperty({
    description: 'Full address of the branch',
    example: '24, allée des frères Menasria, cité Annasr',
  })
  @IsString()
  @IsNotEmpty({ message: 'Address is required' })
  address: string;

  @ApiProperty({
    description: 'Type of branch',
    enum: BranchType,
    example: BranchType.AGA,
  })
  @IsEnum(BranchType, { message: 'Type must be one of: AGA, AGD, AGP, Annexe' })
  type: BranchType;

  @ApiPropertyOptional({
    description: 'Latitude coordinate for map display',
    example: 35.55301,
    minimum: -90,
    maximum: 90,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Latitude must be a number' })
  @Min(-90, { message: 'Latitude must be between -90 and 90' })
  @Max(90, { message: 'Latitude must be between -90 and 90' })
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude coordinate for map display',
    example: 6.1703,
    minimum: -180,
    maximum: 180,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Longitude must be a number' })
  @Min(-180, { message: 'Longitude must be between -180 and 180' })
  @Max(180, { message: 'Longitude must be between -180 and 180' })
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Phone number of the branch',
    example: '+213 23 45 67 89',
  })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({
    type: Object,
    description: 'Tenant-defined custom fields payload',
  })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}

