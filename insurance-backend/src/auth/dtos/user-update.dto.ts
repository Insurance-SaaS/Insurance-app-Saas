import { Type } from 'class-transformer';
import { IsOptional, IsString, IsIn, IsInt, IsPhoneNumber, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'New username', example: 'johnny_d' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  @ApiPropertyOptional({
    description:
      'New phone number. Requires otpSms, obtained through /auth/send-otp-phone-change.',
    example: '+213600000001',
  })
  @IsOptional()
  @IsPhoneNumber('DZ', { message: 'Phone number must be a valid Algerian phone number' })
  phone?: string;

  @ApiPropertyOptional({
    description: 'OTP sent to the new phone number (required when phone is provided)',
    example: 654321,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  otpSms?: number;

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
