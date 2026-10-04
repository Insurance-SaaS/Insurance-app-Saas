import type { GetQuotes } from 'src/modules/quotes/quotes.service';
import type { Product } from 'src/modules/quotes/entities/product.entity';
import type { Quote } from 'src/modules/quotes/entities/quote.entity';
import type { SupportedLanguage } from 'src/shared/utils/multilingual.util';

/** A quote rendered in one language; the exact fields depend on the view requested. */
export type LocalisedQuote = { id: string; title: string } & Record<string, any>;

/**
 * What other modules may ask of the quotes module (used by the AI assistant and
 * the ERP integration). Types are imported as types only.
 */
export interface IQuotesService {
  findById(id: string): Promise<Quote>;
  getAllDevis(): Promise<Quote[]>;
  getAllDevisByProductType(productType: string): Promise<Quote[]>;
  getAllProducts(): Promise<Product[]>;
  /** Quotes matching the user's criteria, best match first, localised. */
  getRecommmendedDevis(filters: GetQuotes, language?: SupportedLanguage): Promise<LocalisedQuote[]>;
  /** One quote with its coverage, payments and terms, localised. */
  getDetailsDevis(id: string, language?: SupportedLanguage): Promise<LocalisedQuote>;
  compareDevis(
    devisAId: string,
    devisBId: string,
    language?: SupportedLanguage,
  ): Promise<{ planA: LocalisedQuote; planB: LocalisedQuote }>;
}
