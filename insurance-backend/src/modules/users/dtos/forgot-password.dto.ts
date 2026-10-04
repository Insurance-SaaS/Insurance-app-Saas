import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
} from 'class-validator';
import { NormalizedEmail } from 'src/shared/decorators/normalized-email.decorator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
  })
  @NormalizedEmail()
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'New password',
    example: 'NewStrongP@ssw0rd',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
