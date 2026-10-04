import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { TranslateRequestDto } from './dtos/translate-request.dto';
import { TranslateResponseDto, SupportedLanguagesResponseDto } from './dtos/translate-response.dto';

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly translationApiUrl: string;
  private cachedLanguages: SupportedLanguagesResponseDto | null = null;

  constructor(private readonly configService: ConfigService) {
    // Get the translation API URL from environment variables or use default
    this.translationApiUrl =
      this.configService.get<string>('TRANSLATION_API_URL') || 'http://localhost:5000';

    this.axiosInstance = axios.create({
      baseURL: this.translationApiUrl,
      timeout: 30000, // 30 seconds timeout for translation
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.logger.log(`Translation service initialized with API URL: ${this.translationApiUrl}`);
  }

  /**
   * Translate text from one language to another
   */
  async translate(translateDto: TranslateRequestDto): Promise<TranslateResponseDto> {
    try {
      this.logger.debug(
        `Translating text to ${translateDto.target_lang}: "${translateDto.text.substring(0, 50)}..."`,
      );

      const response = await this.axiosInstance.post<TranslateResponseDto>(
        '/translate',
        translateDto,
      );

      this.logger.debug('Translation successful');
      return response.data;
    } catch (error) {
      this.logger.error(
        `Translation failed: ${error.response?.data?.error || error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          message: 'Translation service error',
          error: error.response?.data?.error || error.message,
        },
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Translate a single text string quickly
   */
  async translateText(text: string, targetLang: string, sourceLang?: string): Promise<string> {
    if (!text || text.trim() === '') {
      return text;
    }

    try {
      const result = await this.translate({
        text,
        target_lang: targetLang,
        source_lang: sourceLang,
      });
      return result.translated_text;
    } catch (error) {
      this.logger.warn(`Failed to translate text, returning original: ${error.message}`);
      return text; // Return original text if translation fails
    }
  }

  /**
   * Translate an object recursively
   */
  async translateObject(obj: any, targetLang: string, sourceLang?: string): Promise<any> {
    if (!obj || targetLang === 'en') {
      return obj; // No translation needed for English
    }

    if (typeof obj === 'string') {
      return await this.translateText(obj, targetLang, sourceLang);
    }

    if (Array.isArray(obj)) {
      return Promise.all(obj.map((item) => this.translateObject(item, targetLang, sourceLang)));
    }

    if (typeof obj === 'object') {
      const translated: any = {};
      const keys = Object.keys(obj);

      for (const key of keys) {
        // Skip certain fields that shouldn't be translated
        if (this.shouldSkipField(key)) {
          translated[key] = obj[key];
        } else {
          translated[key] = await this.translateObject(obj[key], targetLang, sourceLang);
        }
      }

      return translated;
    }

    return obj;
  }

  /**
   * Batch translate multiple texts
   */
  async translateBatch(
    texts: string[],
    targetLang: string,
    sourceLang?: string,
  ): Promise<string[]> {
    const translations = await Promise.all(
      texts.map((text) => this.translateText(text, targetLang, sourceLang)),
    );
    return translations;
  }

  /**
   * Get supported languages
   */
  async getSupportedLanguages(): Promise<SupportedLanguagesResponseDto> {
    // Return cached languages if available
    if (this.cachedLanguages) {
      return this.cachedLanguages;
    }

    try {
      const response = await this.axiosInstance.get<SupportedLanguagesResponseDto>('/languages');
      this.cachedLanguages = response.data;
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch supported languages: ${error.message}`, error.stack);
      // Return default languages if API fails
      return {
        supported_languages: [
          { code: 'en', name: 'English' },
          { code: 'fr', name: 'French' },
          { code: 'ar', name: 'Arabic' },
        ],
      };
    }
  }

  /**
   * Check if translation service is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.axiosInstance.get('/health');
      return response.data.status === 'healthy';
    } catch (error) {
      this.logger.error(`Translation service health check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Determine if a field should be skipped during translation
   */
  private shouldSkipField(fieldName: string): boolean {
    const skipFields = [
      'id',
      'uuid',
      'createdAt',
      'updatedAt',
      'deletedAt',
      'created_at',
      'updated_at',
      'deleted_at',
      'password',
      'email',
      'phone',
      'url',
      'uri',
      'link',
      'href',
      'src',
      'timestamp',
      'date',
      'time',
      'amount',
      'price',
      'cost',
      'total',
      'quantity',
      'count',
      'number',
      'code',
      'token',
      'key',
      'hash',
      'userId',
      'user_id',
      'contractId',
      'contract_id',
      'sinisterId',
      'sinister_id',
      'devisId',
      'devis_id',
      'productId',
      'product_id',
    ];

    return skipFields.some((skip) => fieldName.toLowerCase().includes(skip.toLowerCase()));
  }
}
