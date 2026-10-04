import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';

/**
 * Base DTO for queries that support translation
 * Extend this class to add translation support to your query DTOs
 */
export class TranslatableQueryDto {
  @ApiPropertyOptional({
    description: 'Language for response translation (English, French, Arabic)',
    example: 'ar',
    enum: ['en', 'fr', 'ar'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['en', 'fr', 'ar'], {
    message: 'Language must be one of: en, fr, ar',
  })
  lang?: string;
}
