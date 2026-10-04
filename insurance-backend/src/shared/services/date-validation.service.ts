import { Injectable, Logger, Optional } from '@nestjs/common';
import { TenantContextService } from 'src/core/tenant/tenant.context';

export interface DateValidationResult {
  isValid: boolean;
  isToday: boolean;
  isFuture: boolean;
  isPast: boolean;
  daysDifference: number;
  formattedDate: string;
  errorMessage?: string;
}

export interface TimeValidationResult {
  isValid: boolean;
  isFuture: boolean;
  isPast: boolean;
  formattedTime: string;
  errorMessage?: string;
}

export interface DateTimeValidationResult {
  isValid: boolean;
  isFuture: boolean;
  isPast: boolean;
  isToday: boolean;
  daysDifference: number;
  formattedDateTime: string;
  errorMessage?: string;
}

@Injectable()
export class DateValidationService {
  private readonly logger = new Logger(DateValidationService.name);

  constructor(@Optional() private readonly tenantContext?: TenantContextService) {}

  /**
   * "Today" and "now" are business notions: an incident at 00:30 in Algiers is
   * today there, although the server (which runs in UTC) is still on yesterday.
   * The zone comes from the tenant (config.timezone), then DEFAULT_TIMEZONE,
   * then the process zone.
   */
  private businessTimeZone(): string | undefined {
    const tenantZone = this.tenantContext?.getTenant()?.config?.timezone;
    return (typeof tenantZone === 'string' && tenantZone) || process.env.DEFAULT_TIMEZONE || undefined;
  }

  /** Calendar date and wall-clock time of `now` in the business time zone. */
  private wallClock(now: Date): {
    year: number;
    month: number;
    day: number;
    hours: number;
    minutes: number;
  } {
    const read = (timeZone: string | undefined) => {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(now);
      const get = (type: string) => Number(parts.find((part) => part.type === type)!.value);
      return {
        year: get('year'),
        month: get('month'),
        day: get('day'),
        hours: get('hour'),
        minutes: get('minute'),
      };
    };
    try {
      return read(this.businessTimeZone());
    } catch {
      // An unknown zone name in the configuration must not break validation.
      return read(undefined);
    }
  }

  /**
   * Validates if a date string is valid and compares it with the current date
   * @param dateString - The date string to validate (any format)
   * @param currentDate - Optional current date for testing (defaults to new Date())
   * @returns DateValidationResult with detailed comparison information
   */
  validateDate(dateString: string, currentDate?: Date): DateValidationResult {
    if (!dateString || dateString.trim().length === 0) {
      return {
        isValid: false,
        isToday: false,
        isFuture: false,
        isPast: false,
        daysDifference: 0,
        formattedDate: '',
        errorMessage: 'Date string is empty or invalid',
      };
    }

    try {
      // Parse the input date
      const inputDate = new Date(dateString.trim());

      // Check if the parsed date is valid
      if (Number.isNaN(inputDate.getTime())) {
        return {
          isValid: false,
          isToday: false,
          isFuture: false,
          isPast: false,
          daysDifference: 0,
          formattedDate: '',
          errorMessage: 'Invalid date format',
        };
      }

      // Use provided current date or get current date
      const now = currentDate || new Date();

      // Normalize dates to start of day for accurate comparison
      const inputDateOnly = new Date(
        inputDate.getFullYear(),
        inputDate.getMonth(),
        inputDate.getDate(),
      );

      const today = this.wallClock(now);
      const todayOnly = new Date(today.year, today.month - 1, today.day);

      // Calculate difference in days
      const timeDifference = inputDateOnly.getTime() - todayOnly.getTime();
      const daysDifference = Math.round(timeDifference / (1000 * 60 * 60 * 24));

      // Determine date relationships
      const isToday = daysDifference === 0;
      const isFuture = daysDifference > 0;
      const isPast = daysDifference < 0;

      // Format the date for display
      const formattedDate = this.toLocalDateString(inputDateOnly); // YYYY-MM-DD format

      this.logger.debug(
        `Date validation: "${dateString}" -> ${formattedDate}, days diff: ${daysDifference}, isToday: ${isToday}, isFuture: ${isFuture}`,
      );

      return {
        isValid: true,
        isToday,
        isFuture,
        isPast,
        daysDifference,
        formattedDate,
      };
    } catch (error) {
      this.logger.error(`Error validating date "${dateString}":`, error.message);
      return {
        isValid: false,
        isToday: false,
        isFuture: false,
        isPast: false,
        daysDifference: 0,
        formattedDate: '',
        errorMessage: 'Error parsing date',
      };
    }
  }

  /**
   * Checks if a date is acceptable for incident reporting (today or past)
   * @param dateString - The date string to check
   * @param currentDate - Optional current date for testing
   * @returns boolean indicating if the date is acceptable
   */
  isDateAcceptableForIncident(dateString: string, currentDate?: Date): boolean {
    const validation = this.validateDate(dateString, currentDate);
    return validation.isValid && !validation.isFuture;
  }

  /**
   * Gets a user-friendly error message for invalid dates
   * @param dateString - The invalid date string
   * @param language - Language for the error message ('fr' or 'en')
   * @param currentDate - Optional current date for testing
   * @returns Localized error message
   */
  getDateErrorMessage(dateString: string, language: string = 'en', currentDate?: Date): string {
    const validation = this.validateDate(dateString, currentDate);

    if (!validation.isValid) {
      return language === 'fr'
        ? 'Format de date invalide. Veuillez fournir une date valide.'
        : 'Invalid date format. Please provide a valid date.';
    }

    if (validation.isFuture) {
      return language === 'fr'
        ? `La date de l'incident ne peut pas être dans le futur. Veuillez fournir une date d'aujourd'hui ou antérieure. (Date fournie: ${validation.formattedDate})`
        : `The incident date cannot be in the future. Please provide a date that is today or earlier. (Provided date: ${validation.formattedDate})`;
    }

    return '';
  }

  /**
   * Gets the current date in YYYY-MM-DD format
   * @param currentDate - Optional current date for testing
   * @returns Current date string
   */
  getCurrentDateString(currentDate?: Date): string {
    const today = this.wallClock(currentDate || new Date());
    return this.toLocalDateString(new Date(today.year, today.month - 1, today.day));
  }

  /**
   * Formats a date as YYYY-MM-DD from its local calendar components.
   * toISOString() converts to UTC first, which shifts a local-midnight date
   * to the previous day on servers east of UTC.
   */
  private toLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Formats a date for display in a specific language
   * @param dateString - The date string to format
   * @param language - Language for formatting ('fr' or 'en')
   * @returns Formatted date string
   */
  formatDateForDisplay(dateString: string, language: string = 'en'): string {
    const validation = this.validateDate(dateString);

    if (!validation.isValid) {
      return dateString; // Return original if invalid
    }

    const date = new Date(validation.formattedDate);

    if (language === 'fr') {
      return date.toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } else {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
  }

  /**
   * Validates a time string and compares it with current time
   * @param timeString - The time string to validate (HH:MM format)
   * @param currentTime - Optional current time for testing
   * @returns TimeValidationResult with detailed comparison information
   */
  validateTime(timeString: string, currentTime?: Date): TimeValidationResult {
    if (!timeString || timeString.trim().length === 0) {
      return {
        isValid: false,
        isFuture: false,
        isPast: false,
        formattedTime: '',
        errorMessage: 'Time string is empty or invalid',
      };
    }

    try {
      // Parse the input time
      const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeString.trim());
      if (!timeMatch) {
        return {
          isValid: false,
          isFuture: false,
          isPast: false,
          formattedTime: '',
          errorMessage: 'Invalid time format. Expected HH:MM',
        };
      }

      const hours = Number.parseInt(timeMatch[1], 10);
      const minutes = Number.parseInt(timeMatch[2], 10);

      // Validate time range
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return {
          isValid: false,
          isFuture: false,
          isPast: false,
          formattedTime: '',
          errorMessage: 'Invalid time. Hours must be 0-23, minutes must be 0-59',
        };
      }

      // Use provided current time or get current time
      const now = currentTime || new Date();
      const { hours: currentHours, minutes: currentMinutes } = this.wallClock(now);

      // Calculate time difference in minutes
      const inputTimeMinutes = hours * 60 + minutes;
      const currentTimeMinutes = currentHours * 60 + currentMinutes;
      const timeDifference = inputTimeMinutes - currentTimeMinutes;

      // Determine time relationships
      const isFuture = timeDifference > 0;
      const isPast = timeDifference < 0;

      // Format the time for display
      const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

      this.logger.debug(
        `Time validation: "${timeString}" -> ${formattedTime}, difference: ${timeDifference} minutes, isFuture: ${isFuture}`,
      );

      return {
        isValid: true,
        isFuture,
        isPast,
        formattedTime,
      };
    } catch (error) {
      this.logger.error(`Error validating time "${timeString}":`, error.message);
      return {
        isValid: false,
        isFuture: false,
        isPast: false,
        formattedTime: '',
        errorMessage: 'Error parsing time',
      };
    }
  }

  /**
   * Validates date and time together for incident reporting
   * @param dateString - The date string to validate
   * @param timeString - The time string to validate
   * @param currentDateTime - Optional current date/time for testing
   * @returns DateTimeValidationResult with comprehensive validation
   */
  validateDateTime(
    dateString: string,
    timeString: string,
    currentDateTime?: Date,
  ): DateTimeValidationResult {
    const dateValidation = this.validateDate(dateString, currentDateTime);

    if (!dateValidation.isValid) {
      return {
        isValid: false,
        isFuture: false,
        isPast: false,
        isToday: false,
        daysDifference: 0,
        formattedDateTime: '',
        errorMessage: dateValidation.errorMessage,
      };
    }

    // If it's today's date, validate the time
    if (dateValidation.isToday && timeString) {
      const timeValidation = this.validateTime(timeString, currentDateTime);

      if (!timeValidation.isValid) {
        return {
          isValid: false,
          isFuture: false,
          isPast: false,
          isToday: true,
          daysDifference: 0,
          formattedDateTime: '',
          errorMessage: timeValidation.errorMessage,
        };
      }

      // If it's today and time is in the future, it's invalid
      if (timeValidation.isFuture) {
        return {
          isValid: false,
          isFuture: true,
          isPast: false,
          isToday: true,
          daysDifference: 0,
          formattedDateTime: `${dateValidation.formattedDate} ${timeValidation.formattedTime}`,
          errorMessage: "The incident time cannot be in the future for today's date",
        };
      }
    }

    return {
      isValid: true,
      isFuture: dateValidation.isFuture,
      isPast: dateValidation.isPast,
      isToday: dateValidation.isToday,
      daysDifference: dateValidation.daysDifference,
      formattedDateTime:
        `${dateValidation.formattedDate} ${timeString ? this.validateTime(timeString).formattedTime : ''}`.trim(),
    };
  }

  /**
   * Checks if a date and time combination is acceptable for incident reporting
   * @param dateString - The date string to check
   * @param timeString - The time string to check (optional)
   * @param currentDateTime - Optional current date/time for testing
   * @returns boolean indicating if the date/time is acceptable
   */
  isDateTimeAcceptableForIncident(
    dateString: string,
    timeString?: string,
    currentDateTime?: Date,
  ): boolean {
    const validation = this.validateDateTime(dateString, timeString || '', currentDateTime);
    return validation.isValid && !validation.isFuture;
  }

  /**
   * Gets a user-friendly error message for invalid date/time combinations
   * @param dateString - The date string
   * @param timeString - The time string
   * @param language - Language for the error message ('fr' or 'en')
   * @param currentDateTime - Optional current date/time for testing
   * @returns Localized error message
   */
  getDateTimeErrorMessage(
    dateString: string,
    timeString: string,
    language: string = 'en',
    currentDateTime?: Date,
  ): string {
    const validation = this.validateDateTime(dateString, timeString, currentDateTime);

    if (!validation.isValid) {
      if (validation.errorMessage) {
        return validation.errorMessage;
      }

      return language === 'fr'
        ? 'Format de date/heure invalide. Veuillez fournir une date et heure valides.'
        : 'Invalid date/time format. Please provide valid date and time.';
    }

    if (validation.isFuture) {
      return language === 'fr'
        ? `L'incident ne peut pas avoir lieu dans le futur. Veuillez fournir une date et heure passées ou actuelles. (Date/heure fournie: ${validation.formattedDateTime})`
        : `The incident cannot occur in the future. Please provide a past or current date and time. (Provided date/time: ${validation.formattedDateTime})`;
    }

    return '';
  }

  /**
   * Validates multiple dates in batch
   * @param dateStrings - Array of date strings to validate
   * @param currentDate - Optional current date for testing
   * @returns Array of validation results
   */
  validateDatesBatch(dateStrings: string[], currentDate?: Date): DateValidationResult[] {
    return dateStrings.map((dateString) => this.validateDate(dateString, currentDate));
  }
}
