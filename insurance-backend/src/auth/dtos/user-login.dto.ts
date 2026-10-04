import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NormalizedEmail } from 'src/shared/decorators/normalized-email.decorator';

export class UserLoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    format: 'email',
  })
  @NormalizedEmail()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'password123',
    format: 'password',
  })
  @IsString()
  @MinLength(6)
  password: string;
}
