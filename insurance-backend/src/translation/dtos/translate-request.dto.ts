import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TranslateRequestDto {
  @ApiProperty({
    description: 'Text to translate',
    example: 'Hello, how can I help you?',
  })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({
    description: 'Target language code (en, fr, ar)',
    example: 'ar',
  })
  @IsString()
  @IsNotEmpty()
  target_lang: string;

  @ApiPropertyOptional({
    description: 'Source language code (optional - will auto-detect if not provided)',
    example: 'en',
  })
  @IsString()
  @IsOptional()
  source_lang?: string;
}
