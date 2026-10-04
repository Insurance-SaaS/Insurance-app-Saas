import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AppLogger } from 'src/shared/logger/app-logger.service';

type GeoResult = {
  isValid: boolean;
  /** True when no geocoder could be reached: the address was accepted as given. */
  unverified?: boolean;
  formattedAddress?: string;
  confidence?: number;
  coordinates?: { lat: number; lon: number };
};

/** Longest address accepted; anything longer is not an address. */
const MAX_LOCATION_LENGTH = 500;

/** Removes leading and trailing commas and white space, in one pass. */
function trimSeparators(text: string): string {
  const isSeparator = (char: string) => char === ',' || char.trim() === '';
  let start = 0;
  let end = text.length;
  while (start < end && isSeparator(text[start])) start++;
  while (end > start && isSeparator(text[end - 1])) end--;
  return text.slice(start, end);
}

@Injectable()
export class LocationValidationService {
  private readonly googleApiKey: string;
  private readonly googleBaseUrl = 'https://maps.googleapis.com/maps/api/geocode/json';
  private readonly nominatimBaseUrl = 'https://nominatim.openstreetmap.org/search';

  // Track whether Google Maps API is available (auto-detected on first call)
  private googleMapsAvailable: boolean | null = null;

  // In-memory cache for geocoding results (TTL = 10 minutes)
  private readonly locationCache = new Map<string, { result: GeoResult; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 10 * 60 * 1000;
  private readonly CACHE_MAX_ENTRIES = 1000;
  private lastNominatimRequestTime = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.googleApiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY') || '';
    if (!this.googleApiKey) {
      this.logger.warn('⚠️ GOOGLE_MAPS_API_KEY is not set — will use Nominatim fallback');
      this.googleMapsAvailable = false;
    }
  }

  /**
   * Main validation logic — tries Google Maps first, falls back to Nominatim
   */
  async validateLocation(location: string): Promise<GeoResult> {
    if (!location || location.trim().length < 2) {
      throw new BadRequestException('Invalid location: empty or too short');
    }
    if (location.length > MAX_LOCATION_LENGTH) {
      throw new BadRequestException(
        `Invalid location: longer than ${MAX_LOCATION_LENGTH} characters`,
      );
    }

    // Check cache first
    const cacheKey = location.trim().toLowerCase();
    const cached = this.locationCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.debug(`📦 Location cache hit for: "${location}"`);
      return cached.result;
    }

    const trimmed = location.trim();
    let result: GeoResult | null = null;
    // Set when a geocoder call fails, as opposed to answering "no match".
    const outcome = { providerFailed: false };

    // Try Google Maps first (if available)
    if (this.googleMapsAvailable !== false) {
      result = await this.geocodeGoogle(trimmed);
    }

    // Fallback to Nominatim
    if (!result) {
      this.logger.debug(`🔄 Falling back to Nominatim for: "${trimmed}"`);
      result = await this.geocodeNominatim(trimmed, outcome);
    }

    if (!result && outcome.providerFailed) {
      // The geocoding service is down or unreachable. That says nothing about
      // the address: accept it as the user wrote it, and do not cache the
      // outcome so it is checked again once the service is back.
      this.logger.warn(`⚠️ Geocoding unavailable; accepting "${trimmed}" unverified`);
      return { isValid: true, unverified: true, formattedAddress: trimmed };
    }

    // Cache the result (positive or negative)
    const finalResult = result || { isValid: false };
    if (this.locationCache.size >= this.CACHE_MAX_ENTRIES) {
      // Oldest entry first (Map keeps insertion order).
      this.locationCache.delete(this.locationCache.keys().next().value as string);
    }
    this.locationCache.set(cacheKey, {
      result: finalResult,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });

    if (!finalResult.isValid) {
      this.logger.warn(`❌ No match found for: "${location}"`);
    }
    return finalResult;
  }

  // ─── Google Maps Geocoding ───────────────────────────────────────────

  private async geocodeGoogle(address: string): Promise<GeoResult | null> {
    if (!this.googleApiKey) return null;

    try {
      const response = await axios.get(this.googleBaseUrl, {
        params: {
          address,
          key: this.googleApiKey,
          region: 'dz',
          language: 'fr',
        },
        timeout: 10000,
      });

      const data = response.data;

      if (data.status === 'REQUEST_DENIED' || data.status === 'OVER_QUERY_LIMIT') {
        // Mark Google Maps as unavailable so we don't keep trying
        if (this.googleMapsAvailable !== false) {
          this.logger.warn(
            `⚠️ Google Maps API ${data.status}: ${data.error_message || 'disabled'}. Switching to Nominatim fallback.`,
          );
          this.googleMapsAvailable = false;
        }
        return null;
      }

      if (data.status === 'ZERO_RESULTS' || data.status !== 'OK' || !data.results?.length) {
        return null;
      }

      // If we get here, Google Maps is working
      this.googleMapsAvailable = true;

      const best = data.results[0];
      const formattedAddress = best.formatted_address;
      const lat = best.geometry?.location?.lat;
      const lon = best.geometry?.location?.lng;

      let confidence = 0.5;
      const locationType = best.geometry?.location_type;
      if (locationType === 'ROOFTOP') confidence += 0.3;
      else if (locationType === 'RANGE_INTERPOLATED') confidence += 0.2;
      else if (locationType === 'GEOMETRIC_CENTER') confidence += 0.15;
      else if (locationType === 'APPROXIMATE') confidence += 0.05;
      if ((formattedAddress || '').toLowerCase().includes(address.toLowerCase())) confidence += 0.1;
      const isAlgeria = (best.address_components || []).some(
        (c: any) =>
          c.types?.includes('country') &&
          (c.short_name === 'DZ' || c.long_name?.toLowerCase().includes('alg')),
      );
      if (isAlgeria) confidence += 0.1;
      confidence = Math.min(1, confidence);

      this.logger.log(
        `✅ [Google] Location validated: "${formattedAddress}" (confidence: ${confidence.toFixed(2)})`,
      );

      return {
        isValid: true,
        formattedAddress,
        confidence,
        coordinates: lat != null && lon != null ? { lat, lon } : undefined,
      };
    } catch (error) {
      this.logger.warn(`⚠️ Google Maps geocoding error: ${error.message || error}`);
      return null;
    }
  }

  // ─── Nominatim (OpenStreetMap) Fallback ──────────────────────────────

  private async geocodeNominatim(
    address: string,
    outcome: { providerFailed: boolean },
  ): Promise<GeoResult | null> {
    // Sanitize non-Latin scripts that break Nominatim
    const sanitized = this.sanitizeForNominatim(address);
    const candidates = this.buildNominatimCandidates(sanitized, address);

    for (const candidate of candidates) {
      const result = await this.tryNominatim(candidate, outcome);
      if (result) return result;
    }
    return null;
  }

  private async tryNominatim(
    candidate: string,
    outcome: { providerFailed: boolean },
  ): Promise<GeoResult | null> {
    const query = encodeURIComponent(`${candidate}, Algeria`);
    const url = `${this.nominatimBaseUrl}?q=${query}&format=json&addressdetails=1&limit=3&accept-language=fr`;

    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Respect Nominatim rate limit: max 1 req/sec
        const now = Date.now();
        const elapsed = now - this.lastNominatimRequestTime;
        if (elapsed < 1100) {
          await new Promise((resolve) => setTimeout(resolve, 1100 - elapsed));
        }
        this.lastNominatimRequestTime = Date.now();

        const response = await axios.get(url, {
          headers: { 'User-Agent': 'InsurancePlatform/1.0' },
          timeout: 15000,
        });

        const results = response.data;
        if (!Array.isArray(results) || results.length === 0) return null;
        return this.fromNominatim(results[0], candidate);
      } catch (error) {
        const isTimeout =
          error.code === 'ECONNABORTED' ||
          error.code === 'ETIMEDOUT' ||
          error.message?.includes('timeout');
        if (isTimeout && attempt < maxRetries) {
          this.logger.warn(
            `⏳ Nominatim timeout for "${candidate}" (attempt ${attempt}), retrying...`,
          );
          continue;
        }
        this.logger.error(`🌍 Nominatim error for "${candidate}":`, error.message || error);
        outcome.providerFailed = true;
        return null;
      }
    }
    return null;
  }

  /** Turns the best Nominatim match into a result, with a confidence between 0.5 and 1. */
  private fromNominatim(best: any, candidate: string): GeoResult {
    const rawName: string = best.display_name || '';
    const formattedAddress = this.sanitizeForNominatim(rawName);

    let confidence = 0.5;
    if (rawName.toLowerCase().includes(candidate.toLowerCase())) confidence += 0.3;
    if (best.address?.city || best.address?.town) confidence += 0.1;
    if (best.address?.country_code === 'dz') confidence += 0.1;
    confidence = Math.min(1, confidence);

    this.logger.log(
      `✅ [Nominatim] Location validated: "${formattedAddress}" (confidence: ${confidence.toFixed(2)})`,
    );
    return {
      isValid: true,
      formattedAddress,
      confidence,
      coordinates: { lat: Number.parseFloat(best.lat), lon: Number.parseFloat(best.lon) },
    };
  }

  private buildNominatimCandidates(sanitized: string, original: string): string[] {
    const seen = new Set<string>();
    const candidates: string[] = [];
    const add = (c: string) => {
      const t = trimSeparators(c);
      if (t.length >= 2 && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        candidates.push(t);
      }
    };
    if (sanitized.length >= 2) add(sanitized);
    const parts = [
      ...new Set(
        sanitized
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p.length > 0),
      ),
    ];
    if (parts.length > 2) add(parts.slice(0, 2).join(', '));
    if (parts.length > 1) add(parts[0]);
    if (original.length >= 2) add(original);
    return candidates;
  }

  private sanitizeForNominatim(text: string): string {
    const cleaned = text
      .replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '')
      .replace(/[\u2D30-\u2D7F]/g, '')
      .replace(/[\u0900-\u097F]/g, '')
      .replace(/[\u4E00-\u9FFF]/g, '')
      .replace(/,\s*,/g, ',')
      .replace(/\s{2,}/g, ' ');
    return trimSeparators(cleaned).replace(/,\s*,/g, ',').trim();
  }

  // ─── Public helpers ──────────────────────────────────────────────────

  async validateLocationWithMessage(
    location: string,
    language: string = 'fr',
  ): Promise<{
    isValid: boolean;
    errorMessage?: string;
    formattedAddress?: string;
    confidence?: number;
    coordinates?: { lat: number; lon: number };
  }> {
    try {
      const result = await this.validateLocation(location);

      if (!result.isValid) {
        const notFound: Record<string, string> = {
          fr: `L'adresse "${location}" est introuvable. Veuillez préciser une ville ou un lieu en Algérie.`,
          ar: `العنوان "${location}" غير موجود. يرجى تحديد مدينة أو مكان في الجزائر.`,
          en: `The address "${location}" could not be found. Please specify a city or location in Algeria.`,
        };
        return { isValid: false, errorMessage: notFound[language] ?? notFound.en };
      }

      return {
        isValid: true,
        formattedAddress: result.formattedAddress,
        confidence: result.confidence,
        coordinates: result.coordinates,
      };
    } catch (error) {
      this.logger.error('Error in validateLocationWithMessage:', error);
      const failed: Record<string, string> = {
        fr: 'Erreur lors de la validation du lieu. Veuillez réessayer.',
        ar: 'حدث خطأ أثناء التحقق من الموقع. حاول مرة أخرى.',
        en: 'Error validating location. Please try again.',
      };
      return { isValid: false, errorMessage: failed[language] ?? failed.en };
    }
  }

  async validateLocationsBatch(
    locations: string[],
  ): Promise<
    {
      location: string;
      isValid: boolean;
      formattedAddress?: string;
      confidence?: number;
      coordinates?: { lat: number; lon: number };
    }[]
  > {
    return Promise.all(
      locations.map(async (loc) => {
        try {
          const result = await this.validateLocation(loc);
          return { location: loc, ...result };
        } catch {
          return { location: loc, isValid: false };
        }
      }),
    );
  }
}
