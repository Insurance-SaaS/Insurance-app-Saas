import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { extractLanguageFromRequest, SupportedLanguage } from '../utils/multilingual.util';

/**
 * Language Interceptor
 *
 * Automatically extracts the user's preferred language from the request
 * and attaches it to the request object for downstream use.
 *
 * Usage: @UseInterceptors(LanguageInterceptor)
 */
@Injectable()
export class LanguageInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Extract and validate language
    const language: SupportedLanguage = extractLanguageFromRequest(request);

    // Attach language to request for use in controllers/services
    request.language = language;

    return next.handle();
  }
}

/**
 * Extended Request interface with language property
 */
export interface RequestWithLanguage extends Request {
  language: SupportedLanguage;
  user?: {
    id: string;
    preferredLanguage?: string;
    [key: string]: any;
  };
}
