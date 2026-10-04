import { Type } from 'class-transformer';
import { IsPhoneNumber, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpSmsDto {
  @ApiProperty({
    description: 'User phone number (required)',
    example: '+213600000000',
    format: 'phone',
  })
  @IsPhoneNumber('DZ', { message: 'Phone number must be a valid Algerian phone number' })
  phone: string;

  @ApiProperty({
    description: 'One-Time Password (OTP) sent to SMS',
    example: 654321,
    type: Number,
  })
  @Type(() => Number)
  @IsInt()
  otpSms: number;
}

