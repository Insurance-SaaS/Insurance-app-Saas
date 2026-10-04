/**
 * Multilingual Utility Service
 *
 * Provides helper functions to transform database entities with multilingual fields
 * into localized responses based on user's preferred language.
 *
 * Supported languages: English (en), French (fr), Arabic (ar)
 */

export type SupportedLanguage = 'en' | 'fr' | 'ar';

/**
 * Get the appropriate language value from an object with multilingual fields
 * @param obj Object containing language-specific fields
 * @param fieldName Base field name (without language suffix)
 * @param language Preferred language code
 * @returns The value in the preferred language, falling back to English if not available
 */
export function getLocalizedField(
  obj: any,
  fieldName: string,
  language: SupportedLanguage = 'en',
): string | undefined {
  if (!obj) return undefined;

  // Check if the entity has a helper method (preferred)
  const methodName = `get${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}`;
  if (typeof obj[methodName] === 'function') {
    return obj[methodName](language);
  }

  // Otherwise, try to access the field directly with language suffix
  const languageField = `${fieldName}${language.charAt(0).toUpperCase()}${language.slice(1)}`;
  const value = obj[languageField] || obj[`${fieldName}_${language}`];

  // Fallback chain: requested language -> English -> French -> original field
  if (value) return value;
  if (language !== 'en' && (obj[`${fieldName}En`] || obj[`${fieldName}_en`])) {
    return obj[`${fieldName}En`] || obj[`${fieldName}_en`];
  }
  if (language !== 'fr' && (obj[`${fieldName}Fr`] || obj[`${fieldName}_fr`])) {
    return obj[`${fieldName}Fr`] || obj[`${fieldName}_fr`];
  }
  return obj[fieldName];
}

/**
 * Transform an object with multilingual fields to use a single language
 * @param obj Object to transform
 * @param fieldsToLocalize Array of field names to localize
 * @param language Preferred language code
 * @returns New object with localized fields
 */
export function localizeObject<T extends Record<string, any>>(
  obj: T,
  fieldsToLocalize: string[],
  language: SupportedLanguage = 'en',
): T {
  if (!obj) return obj;

  const localized = { ...obj };

  for (const field of fieldsToLocalize) {
    const value = getLocalizedField(obj, field, language);
    if (value !== undefined) {
      (localized as any)[field] = value;
    }
  }

  return localized;
}

/**
 * Transform an array of objects with multilingual fields
 * @param array Array of objects to transform
 * @param fieldsToLocalize Array of field names to localize
 * @param language Preferred language code
 * @returns New array with localized objects
 */
export function localizeArray<T extends Record<string, any>>(
  array: T[],
  fieldsToLocalize: string[],
  language: SupportedLanguage = 'en',
): T[] {
  if (!array || !Array.isArray(array)) return array;

  return array.map((item) => localizeObject(item, fieldsToLocalize, language));
}

/**
 * Validate language code
 * @param language Language code to validate
 * @returns Valid language code, defaulting to 'en' if invalid
 */
export function validateLanguage(language: string | undefined): SupportedLanguage {
  const validLanguages: SupportedLanguage[] = ['en', 'fr', 'ar'];
  if (language && validLanguages.includes(language as SupportedLanguage)) {
    return language as SupportedLanguage;
  }
  return 'en';
}

/**
 * Extract language from request headers or query params
 * @param req Express request object
 * @returns Validated language code
 */
export function extractLanguageFromRequest(req: any): SupportedLanguage {
  // Check query parameter first
  const queryLang = req.query?.lang || req.query?.language;
  if (queryLang) {
    return validateLanguage(queryLang);
  }

  // Check headers
  const headerLang = req.headers['accept-language']?.split(',')[0]?.substring(0, 2);
  if (headerLang) {
    return validateLanguage(headerLang);
  }

  // Check user's preferred language from auth
  if (req.user?.preferredLanguage) {
    return validateLanguage(req.user.preferredLanguage);
  }

  // Default to English
  return 'en';
}

/**
 * Decorator to automatically localize fields in entity instances
 * Adds a toLocalizedJSON method to the entity
 */
export function Localizable(fieldsToLocalize: string[]) {
  return function <T extends new (...args: any[]) => object>(constructor: T) {
    return class extends constructor {
      toLocalizedJSON(language: SupportedLanguage = 'en') {
        return localizeObject(this, fieldsToLocalize, language);
      }
    };
  };
}

/**
 * Remove language-specific fields from response to reduce payload size
 * Keeps only the base field with the localized value
 * @param obj Object to clean
 * @param fieldsToClean Array of base field names
 * @returns Cleaned object without language-specific fields
 */
export function cleanMultilingualFields<T extends Record<string, any>>(
  obj: T,
  fieldsToClean: string[],
): Partial<T> {
  if (!obj) return obj;

  const cleaned = { ...obj };

  for (const field of fieldsToClean) {
    // Remove language-specific fields
    delete cleaned[`${field}En`];
    delete cleaned[`${field}Fr`];
    delete cleaned[`${field}Ar`];
    delete cleaned[`${field}_en`];
    delete cleaned[`${field}_fr`];
    delete cleaned[`${field}_ar`];
  }

  return cleaned;
}

/**
 * Transform entity with full localization and cleanup
 * This is the recommended method for API responses
 * @param obj Object to transform
 * @param fieldsToLocalize Array of field names to localize
 * @param language Preferred language code
 * @param cleanFields Whether to remove language-specific fields (default: true)
 * @returns Localized and cleaned object
 */
export function toLocalizedResponse<T extends Record<string, any>>(
  obj: T,
  fieldsToLocalize: string[],
  language: SupportedLanguage = 'en',
  cleanFields = true,
): Partial<T> {
  if (!obj) return obj;

  let localized = localizeObject(obj, fieldsToLocalize, language);

  if (cleanFields) {
    localized = cleanMultilingualFields(localized, fieldsToLocalize) as T;
  }

  return localized;
}

/**
 * Transform array with full localization and cleanup
 * @param array Array of objects to transform
 * @param fieldsToLocalize Array of field names to localize
 * @param language Preferred language code
 * @param cleanFields Whether to remove language-specific fields (default: true)
 * @returns Localized and cleaned array
 */
export function toLocalizedArrayResponse<T extends Record<string, any>>(
  array: T[],
  fieldsToLocalize: string[],
  language: SupportedLanguage = 'en',
  cleanFields = true,
): Partial<T>[] {
  if (!array || !Array.isArray(array)) return array;

  return array.map((item) => toLocalizedResponse(item, fieldsToLocalize, language, cleanFields));
}
