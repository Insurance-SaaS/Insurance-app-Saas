import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { NormalizedEmail } from 'src/shared/decorators/normalized-email.decorator';

export class PlatformAdminLoginDto {
  @ApiProperty({ example: 'admin@insurance-platform.local' })
  @NormalizedEmail()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'ChangeMe123!' })
  @IsString()
  @MinLength(8)
  password: string;
}
