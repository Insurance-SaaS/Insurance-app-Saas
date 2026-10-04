import { Type } from 'class-transformer';
import {
  IsEmail,
  IsPhoneNumber,
  IsInt,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NormalizedEmail } from 'src/shared/decorators/normalized-email.decorator';

export class VerifyOtpDto {
  @ApiProperty({
    description: 'User email address (required)',
    example: 'user@example.com',
    format: 'email',
  })
  @NormalizedEmail()
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User phone number (optional, required only if otpSms is provided)',
    example: '+213600000000',
    format: 'phone',
    required: false,
  })
  @IsOptional()
  @IsPhoneNumber('DZ', { message: 'Phone number must be a valid Algerian phone number' })
  phone?: string;

  @ApiProperty({
    description: `One-Time Password (OTP) sent to SMS (optional).
    
    **Behavior:**
    - If provided and correct → user account is created WITH phone number
    - If provided but wrong → returns error (you can retry or skip by not including this field)
    - If not provided → user account is created WITHOUT phone number (SMS verification skipped)`,
    example: 654321,
    type: Number,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  otpSms?: number;
}
