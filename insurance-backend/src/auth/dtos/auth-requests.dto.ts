import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsJWT, IsPhoneNumber, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NormalizedEmail } from 'src/shared/decorators/normalized-email.decorator';

/** Body of the endpoints that only take an email address. */
export class EmailOnlyDto {
  @ApiProperty({ description: 'Account email address', example: 'user@example.com' })
  @NormalizedEmail()
  @IsEmail()
  email: string;
}

/** Body of the endpoints that only take a phone number. */
export class PhoneOnlyDto {
  @ApiProperty({ description: 'Phone number', example: '+213600000000' })
  @IsPhoneNumber('DZ', { message: 'Phone number must be a valid Algerian phone number' })
  phone: string;
}

export class VerifyResetOtpDto {
  @ApiProperty({ description: 'Account email address', example: 'user@example.com' })
  @NormalizedEmail()
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'OTP received by email', example: 123456 })
  @Type(() => Number)
  @IsInt()
  otpEmail: number;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token returned at login' })
  @IsJWT()
  refreshToken: string;
}

export class DeleteAccountDto {
  @ApiProperty({ description: 'OTP received by email', example: 123456 })
  @Type(() => Number)
  @IsInt()
  otpEmail: number;
}

export class GoogleMobileLoginDto {
  @ApiProperty({ description: 'Google ID token obtained by the mobile app' })
  @IsString()
  @MinLength(20)
  idToken: string;
}
