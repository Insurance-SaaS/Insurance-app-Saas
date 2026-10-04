/**
 * Translation Module Exports
 *
 * Central export file for translation-related functionality
 */

export { TranslationModule } from './translation.module';
export { TranslationService } from './translation.service';
export { TranslationController } from './translation.controller';
export { TranslationInterceptor } from './interceptors/translation.interceptor';
export { Translatable, NoTranslation } from './decorators/translatable.decorator';
export { ApiTranslation } from './decorators/api-translation.decorator';

// DTOs
export { TranslateRequestDto } from './dtos/translate-request.dto';
export {
  TranslateResponseDto,
  SupportedLanguageDto,
  SupportedLanguagesResponseDto,
} from './dtos/translate-response.dto';
