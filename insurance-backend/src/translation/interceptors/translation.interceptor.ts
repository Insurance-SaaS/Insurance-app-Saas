import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { TranslationService } from '../translation.service';
import { TRANSLATABLE_KEY } from '../decorators/translatable.decorator';

@Injectable()
export class TranslationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TranslationInterceptor.name);

  constructor(
    private readonly translationService: TranslationService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Check if translation is enabled for this endpoint
    const isTranslatable = this.reflector.getAllAndOverride<boolean>(TRANSLATABLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If translation is explicitly disabled, skip
    if (isTranslatable === false) {
      return next.handle();
    }

    // Get target language from:
    // 1. Query parameter (?lang=ar)
    // 2. Header (Accept-Language or X-Language)
    // 3. User preference (if authenticated)
    // 4. Default to 'en'
    const targetLang = this.getTargetLanguage(request);

    // If target language is English or not set, skip translation
    if (!targetLang || targetLang === 'en') {
      return next.handle();
    }

    // Only translate if explicitly enabled and target lang is not English
    if (isTranslatable !== true) {
      return next.handle();
    }

    return next.handle().pipe(
      switchMap(async (data) => {
        try {
          this.logger.debug(
            `Translating response to ${targetLang} for ${request.method} ${request.url}`,
          );

          // Translate the response data
          const translated = await this.translationService.translateObject(data, targetLang);

          return translated;
        } catch (error) {
          this.logger.error(`Failed to translate response: ${error.message}`, error.stack);
          // Return original data if translation fails
          return data;
        }
      }),
    );
  }

  /**
   * Get the target language for translation
   */
  private getTargetLanguage(request: any): string | null {
    // 1. Check query parameter
    if (request.query?.lang) {
      return request.query.lang;
    }

    // 2. Check custom header
    if (request.headers['x-language']) {
      return request.headers['x-language'];
    }

    // 3. Check Accept-Language header
    if (request.headers['accept-language']) {
      const lang = this.parseAcceptLanguageHeader(request.headers['accept-language']);
      if (lang) {
        return lang;
      }
    }

    // 4. Check authenticated user's preference
    if (request.user?.preferredLanguage) {
      return request.user.preferredLanguage;
    }

    // Default to null (no translation)
    return null;
  }

  /**
   * Parse Accept-Language header to get preferred language
   */
  private parseAcceptLanguageHeader(header: string): string | null {
    try {
      const languages = header.split(',').map((lang) => {
        const parts = lang.trim().split(';');
        const code = parts[0].split('-')[0]; // Get base language code (e.g., 'en' from 'en-US')
        return code;
      });

      // Return first supported language
      const supportedLangs = new Set(['en', 'fr', 'ar']);
      for (const lang of languages) {
        if (supportedLangs.has(lang)) {
          return lang;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to parse Accept-Language header "${header}": ${(error as Error).message}`,
      );
    }

    return null;
  }
}
