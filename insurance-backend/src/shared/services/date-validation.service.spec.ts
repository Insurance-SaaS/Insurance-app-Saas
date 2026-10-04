import { Test, TestingModule } from '@nestjs/testing';
import { DateValidationService } from './date-validation.service';

/** YYYY-MM-DD of a date in the process time zone, the same calendar the service uses. */
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('DateValidationService', () => {
  let service: DateValidationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DateValidationService],
    }).compile();

    service = module.get<DateValidationService>(DateValidationService);
  });

  describe('validateDate', () => {
    it('should return invalid for empty or null dates', () => {
      expect(service.validateDate('')).toEqual({
        isValid: false,
        isToday: false,
        isFuture: false,
        isPast: false,
        daysDifference: 0,
        formattedDate: '',
        errorMessage: 'Date string is empty or invalid',
      });

      expect(service.validateDate(null as any)).toEqual({
        isValid: false,
        isToday: false,
        isFuture: false,
        isPast: false,
        daysDifference: 0,
        formattedDate: '',
        errorMessage: 'Date string is empty or invalid',
      });
    });

    it('should return invalid for malformed dates', () => {
      const result = service.validateDate('invalid-date');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Invalid date format');
    });

    it("should correctly identify today's date", () => {
      const today = new Date();
      const todayString = ymd(today);

      const result = service.validateDate(todayString);

      expect(result.isValid).toBe(true);
      expect(result.isToday).toBe(true);
      expect(result.isFuture).toBe(false);
      expect(result.isPast).toBe(false);
      expect(result.daysDifference).toBe(0);
      expect(result.formattedDate).toBe(todayString);
    });

    it('should correctly identify future dates', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowString = ymd(tomorrow);

      const result = service.validateDate(tomorrowString);

      expect(result.isValid).toBe(true);
      expect(result.isToday).toBe(false);
      expect(result.isFuture).toBe(true);
      expect(result.isPast).toBe(false);
      expect(result.daysDifference).toBe(1);
    });

    it('should correctly identify past dates', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = ymd(yesterday);

      const result = service.validateDate(yesterdayString);

      expect(result.isValid).toBe(true);
      expect(result.isToday).toBe(false);
      expect(result.isFuture).toBe(false);
      expect(result.isPast).toBe(true);
      expect(result.daysDifference).toBe(-1);
    });

    it('should work with custom current date for testing', () => {
      const testDate = new Date('2025-10-28');
      const pastDate = '2025-10-27';
      const futureDate = '2025-10-29';

      const pastResult = service.validateDate(pastDate, testDate);
      const futureResult = service.validateDate(futureDate, testDate);

      expect(pastResult.isPast).toBe(true);
      expect(pastResult.daysDifference).toBe(-1);

      expect(futureResult.isFuture).toBe(true);
      expect(futureResult.daysDifference).toBe(1);
    });
  });

  describe('isDateAcceptableForIncident', () => {
    it("should accept today's date", () => {
      const today = ymd(new Date());
      expect(service.isDateAcceptableForIncident(today)).toBe(true);
    });

    it('should accept past dates', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = ymd(yesterday);

      expect(service.isDateAcceptableForIncident(yesterdayString)).toBe(true);
    });

    it('should reject future dates', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowString = ymd(tomorrow);

      expect(service.isDateAcceptableForIncident(tomorrowString)).toBe(false);
    });

    it('should reject invalid dates', () => {
      expect(service.isDateAcceptableForIncident('invalid')).toBe(false);
      expect(service.isDateAcceptableForIncident('')).toBe(false);
    });
  });

  describe('getDateErrorMessage', () => {
    it('should return French error message for invalid dates', () => {
      const message = service.getDateErrorMessage('invalid', 'fr');
      expect(message).toBe('Format de date invalide. Veuillez fournir une date valide.');
    });

    it('should return English error message for invalid dates', () => {
      const message = service.getDateErrorMessage('invalid', 'en');
      expect(message).toBe('Invalid date format. Please provide a valid date.');
    });

    it('should return French error message for future dates', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowString = ymd(tomorrow);

      const message = service.getDateErrorMessage(tomorrowString, 'fr');
      expect(message).toContain("La date de l'incident ne peut pas être dans le futur");
      expect(message).toContain(tomorrowString);
    });

    it('should return English error message for future dates', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowString = ymd(tomorrow);

      const message = service.getDateErrorMessage(tomorrowString, 'en');
      expect(message).toContain('The incident date cannot be in the future');
      expect(message).toContain(tomorrowString);
    });

    it('should return empty string for valid dates', () => {
      const today = ymd(new Date());
      const message = service.getDateErrorMessage(today, 'fr');
      expect(message).toBe('');
    });
  });

  describe('getCurrentDateString', () => {
    it('should return current date in YYYY-MM-DD format', () => {
      const currentDate = service.getCurrentDateString();
      const expectedFormat = /^\d{4}-\d{2}-\d{2}$/;
      expect(currentDate).toMatch(expectedFormat);
    });

    it('should work with custom date for testing', () => {
      const testDate = new Date('2025-10-28T10:30:00Z');
      const result = service.getCurrentDateString(testDate);
      expect(result).toBe('2025-10-28');
    });
  });

  describe('formatDateForDisplay', () => {
    it('should format date in French', () => {
      const result = service.formatDateForDisplay('2025-10-28', 'fr');
      expect(result).toContain('octobre');
      expect(result).toContain('2025');
    });

    it('should format date in English', () => {
      const result = service.formatDateForDisplay('2025-10-28', 'en');
      expect(result).toContain('October');
      expect(result).toContain('2025');
    });

    it('should return original string for invalid dates', () => {
      const result = service.formatDateForDisplay('invalid-date', 'fr');
      expect(result).toBe('invalid-date');
    });
  });

  describe('validateDatesBatch', () => {
    it('should validate multiple dates', () => {
      const dates = ['2025-10-28', '2025-10-29', 'invalid-date'];
      const results = service.validateDatesBatch(dates);

      expect(results).toHaveLength(3);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(true);
      expect(results[2].isValid).toBe(false);
    });
  });
});

describe('DateValidationService business time zone', () => {
  // 23:30 UTC on 3 October is already 00:30 on 4 October in Algiers (UTC+1).
  const lateEveningUtc = new Date('2026-10-03T23:30:00.000Z');

  const serviceFor = (timezone?: string) =>
    new DateValidationService({
      getTenant: () => (timezone ? { config: { timezone } } : undefined),
    } as any);

  it("treats the tenant's calendar day as today", () => {
    const result = serviceFor('Africa/Algiers').validateDate('2026-10-04', lateEveningUtc);

    expect(result.isToday).toBe(true);
    expect(result.isFuture).toBe(false);
  });

  it('gives a tenant further west its own day', () => {
    const result = serviceFor('America/New_York').validateDate('2026-10-04', lateEveningUtc);

    expect(result.isFuture).toBe(true);
  });

  it('falls back to the process zone for an unknown zone name', () => {
    const result = serviceFor('Not/AZone').validateDate('2020-01-01', lateEveningUtc);

    expect(result.isValid).toBe(true);
    expect(result.isPast).toBe(true);
  });
});
