import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { CustomFieldEntityType, CustomFieldType } from '../entities/custom-field-definition.entity';

export class CreateCustomFieldDefinitionDto {
  @ApiProperty({ enum: CustomFieldEntityType })
  @IsEnum(CustomFieldEntityType)
  entityType: CustomFieldEntityType;

  @ApiProperty({ example: 'vehicle_info' })
  @IsString()
  @IsNotEmpty()
  fieldName: string;

  @ApiProperty({ enum: CustomFieldType })
  @IsEnum(CustomFieldType)
  fieldType: CustomFieldType;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultValue?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  enumValues?: string[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  validationRules?: Record<string, unknown>;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  labelEn: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  labelFr: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  labelAr: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isSearchable?: boolean;
}
