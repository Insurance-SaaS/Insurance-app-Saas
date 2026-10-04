import { PASSWORD_POLICY } from 'src/shared/validation/password-policy';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsPhoneNumber,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsEnum,
  IsObject,
} from 'class-validator';
import { UserRole } from '../entities/user.entity';
import { NormalizedEmail } from 'src/shared/decorators/normalized-email.decorator';

export class CreateUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    type: String,
  })
  @NormalizedEmail()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    description:
      'User password (must contain at least one uppercase letter, one lowercase letter, and one number)',
    example: 'Password123',
    minLength: 6,
    type: String,
  })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  @Matches(PASSWORD_POLICY, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;

  @ApiProperty({
    description: 'Algerian phone number (must start with +213 or 0)',
    example: '+213555123456',
    pattern: String.raw`^(\+213|0)[5-7]\d{8}$`,
    type: String,
  })
  @IsString()
  @IsPhoneNumber('DZ', {
    message: 'Phone number must be a valid Algerian phone number',
  })
  @Matches(/^(\+213|0)[5-7]\d{8}$/, {
    message:
      'Phone number must be a valid Algerian mobile number (e.g., +213555123456 or 0555123456)',
  })
  phone: string;

  @ApiProperty({
    description: 'Username',
    example: 'john_doe',
    minLength: 5,
    maxLength: 100,
    type: String,
  })
  @IsString()
  @MinLength(5, { message: 'Username must be at least 5 characters long' })
  @MaxLength(100, { message: 'Username cannot exceed 100 characters' })
  username: string;

  @ApiPropertyOptional({
    description: 'Profile picture URL or file',
    example: 'https://example.com/profile.jpg',
    type: String,
    required: false,
  })
  @IsOptional()
  profilePictureUrl?: string;

  @ApiPropertyOptional({
    description: 'User role (admin can set tenant/platform roles)',
    enum: UserRole,
    default: UserRole.USER,
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
}
