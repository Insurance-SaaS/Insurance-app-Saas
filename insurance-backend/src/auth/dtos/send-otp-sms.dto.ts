import { IsEmail, IsPhoneNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NormalizedEmail } from 'src/shared/decorators/normalized-email.decorator';

export class SendOtpSmsDto {
  @ApiProperty({
    description: 'User email address (required) - must match the email used during signup',
    example: 'user@example.com',
    format: 'email',
  })
  @NormalizedEmail()
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User phone number (required) - must be a valid Algerian phone number',
    example: '+213600000000',
    format: 'phone',
  })
  @IsPhoneNumber('DZ', { message: 'Phone number must be a valid Algerian phone number' })
  phone: string;
}

