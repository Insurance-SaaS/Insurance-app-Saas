import { PASSWORD_POLICY } from 'src/shared/validation/password-policy';
import {
  IsEmail,
  IsHexadecimal,
  Length,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NormalizedEmail } from 'src/shared/decorators/normalized-email.decorator';
export class UpdatePassDto {
  @ApiProperty({
    description: 'Account email to reset the password for',
    example: 'user@example.com',
    format: 'email',
  })
  @NormalizedEmail()
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Single-use token returned by /auth/verify-otp-reset',
    example: '3f1c…(64 hex characters)',
  })
  @IsHexadecimal()
  @Length(64, 64)
  resetToken: string;

  @ApiProperty({
    description: 'New password that satisfies complexity rules',
    example: 'NewPass123',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_POLICY, {
    message:
      'password must contain at least one uppercase letter, one lowercase letter and one number',
  })
  newPassword: string;
}
