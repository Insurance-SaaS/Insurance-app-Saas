import { applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

/**
 * Swagger decorator to document the language query parameter
 * Use this along with @Translatable() to show translation options in Swagger UI
 */
export function ApiTranslation() {
  return applyDecorators(
    ApiQuery({
      name: 'lang',
      required: false,
      enum: ['en', 'fr', 'ar'],
      description: 'Language for response translation (English, French, Arabic)',
      example: 'ar',
    }),
  );
}
