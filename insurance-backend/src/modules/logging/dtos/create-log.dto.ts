import { IsString, IsOptional } from 'class-validator';

export class CreateLogDto {
  @IsString()
  action: string;

  // Will look like "123.45ms"
  @IsString()
  actionDuration: string;

  @IsOptional()
  timestamp?: Date;
}
