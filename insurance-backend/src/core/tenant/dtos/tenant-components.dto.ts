import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TenantComponentStateDto {
  @ApiProperty({ example: 'claims' })
  @IsString()
  @IsNotEmpty()
  componentName: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isEnabled: boolean;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateTenantComponentsDto {
  @ApiProperty({ type: [TenantComponentStateDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TenantComponentStateDto)
  components: TenantComponentStateDto[];
}
