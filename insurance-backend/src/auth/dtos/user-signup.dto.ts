import { PASSWORD_POLICY } from 'src/shared/validation/password-policy';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NormalizedEmail } from 'src/shared/decorators/normalized-email.decorator';

export class UserSignupDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    format: 'email',
  })
  @NormalizedEmail()
  @IsEmail({}, { message: 'Please provide a valid email' })
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'password123',
    format: 'password',
  })
  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_POLICY, {
    message:
      'password must contain at least one uppercase letter, one lowercase letter and one number , min length is 8',
  })
  password: string;

  @ApiProperty({
    description: 'User phone number',
    example: '+213600000000',
    format: 'phone',
  })
  @IsString()
  @IsNotEmpty()
  @IsPhoneNumber('DZ')
  phone: string;
  @ApiProperty({
    description: 'Username',
    example: 'john_doe',
    minLength: 5,
  })
  @MinLength(5)
  @IsString()
  username: string;

  @IsOptional()
  profilePictureUrl?: any;
}
