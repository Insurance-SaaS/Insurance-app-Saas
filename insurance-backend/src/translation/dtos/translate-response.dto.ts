import { ApiProperty } from '@nestjs/swagger';

export class TranslateResponseDto {
  @ApiProperty({ description: 'Whether the translation was successful' })
  success: boolean;

  @ApiProperty({ description: 'Original text' })
  original_text: string;

  @ApiProperty({ description: 'Translated text' })
  translated_text: string;

  @ApiProperty({ description: 'Detected or provided source language code' })
  source_lang: string;

  @ApiProperty({ description: 'Target language code' })
  target_lang: string;

  @ApiProperty({ description: 'Source language name' })
  source_lang_name: string;

  @ApiProperty({ description: 'Target language name' })
  target_lang_name: string;
}

export class SupportedLanguageDto {
  @ApiProperty({ description: 'Language code' })
  code: string;

  @ApiProperty({ description: 'Language name' })
  name: string;
}

export class SupportedLanguagesResponseDto {
  @ApiProperty({
    description: 'List of supported languages',
    type: [SupportedLanguageDto],
  })
  supported_languages: SupportedLanguageDto[];
}
