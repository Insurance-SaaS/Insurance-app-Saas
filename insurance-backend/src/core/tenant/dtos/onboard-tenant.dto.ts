import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateTenantDto } from './create-tenant.dto';
import { NormalizedEmail } from 'src/shared/decorators/normalized-email.decorator';

class TenantAdminSeedDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty()
  @NormalizedEmail()
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ default: 'en' })
  @IsOptional()
  @IsString()
  preferredLanguage?: string = 'en';
}

class ComponentSeedDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  componentName: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean = true;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class OnboardTenantDto {
  @ApiProperty({ type: CreateTenantDto })
  @ValidateNested()
  @Type(() => CreateTenantDto)
  tenant: CreateTenantDto;

  @ApiProperty({ type: TenantAdminSeedDto })
  @ValidateNested()
  @Type(() => TenantAdminSeedDto)
  tenantAdmin: TenantAdminSeedDto;

  @ApiPropertyOptional({ type: [ComponentSeedDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComponentSeedDto)
  components?: ComponentSeedDto[];
}
