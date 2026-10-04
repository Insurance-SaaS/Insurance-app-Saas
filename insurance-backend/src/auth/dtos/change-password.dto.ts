import { PASSWORD_POLICY } from 'src/shared/validation/password-policy';
import { IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password', example: 'CurrentPass123', minLength: 8 })
  @IsString()
  @MinLength(8)
  oldPassword: string;

  @ApiProperty({ description: 'New password', example: 'NewPass123', minLength: 8 })
  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_POLICY, {
    message:
      'password must contain at least one uppercase letter, one lowercase letter and one number',
  })
  newPassword: string;
}
