import { SetMetadata } from '@nestjs/common';

export const TRANSLATABLE_KEY = 'translatable';

/**
 * Decorator to enable automatic translation for an endpoint
 * @param enabled - Whether translation should be enabled for this endpoint
 */
export const Translatable = (enabled: boolean = true) => SetMetadata(TRANSLATABLE_KEY, enabled);

/**
 * Decorator to disable automatic translation for an endpoint
 */
export const NoTranslation = () => SetMetadata(TRANSLATABLE_KEY, false);
