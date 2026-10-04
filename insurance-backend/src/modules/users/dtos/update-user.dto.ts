import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsIn,
  IsEnum,
  IsObject,
} from 'class-validator';
import { UserRole } from '../entities/user.entity';
export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'Username',
    example: 'john_doe_updated',
    minLength: 3,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  username?: string;

  @ApiPropertyOptional({
    description: 'Phone number',
    example: '+213555123456',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(\+213|0)[5-7]\d{8}$/, {
    message: 'Phone number must be a valid Algerian phone number',
  })
  phone?: string;

  @ApiPropertyOptional({
    description: 'New password',
    example: 'NewStrongP@ssw0rd',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({
    description: 'User role (Admin only)',
    enum: UserRole,
    example: UserRole.TENANT_ADMIN,
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    type: Object,
    description: 'Tenant-defined custom fields payload',
  })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Preferred language for content translation',
    example: 'ar',
    enum: ['en', 'fr', 'ar'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['en', 'fr', 'ar'], {
    message: 'Preferred language must be one of: en, fr, ar',
  })
  preferredLanguage?: string;
}
