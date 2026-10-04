import { IsString, IsEmail, IsOptional } from 'class-validator';
import { NormalizedEmail } from 'src/shared/decorators/normalized-email.decorator';

export class CreateSignupLogDto {
  @IsString()
  action: string; // e.g. "SIGNUP"

  @NormalizedEmail()
  @IsEmail()
  email: string;

  // Will look like "123.45ms"
  @IsString()
  actionDuration: string;

  @IsOptional()
  timestamp?: Date;
}
