import { Type } from 'class-transformer';
import { IsEmail, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NormalizedEmail } from 'src/shared/decorators/normalized-email.decorator';

export class VerifyOtpEmailDto {
  @ApiProperty({
    description: 'User email address (required)',
    example: 'user@example.com',
    format: 'email',
  })
  @NormalizedEmail()
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'One-Time Password (OTP) sent to email',
    example: 123456,
    type: Number,
  })
  @Type(() => Number)
  @IsInt()
  otpEmail: number;
}

