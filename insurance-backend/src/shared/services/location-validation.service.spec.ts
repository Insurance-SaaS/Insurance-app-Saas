import { BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { LocationValidationService } from './location-validation.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LocationValidationService', () => {
  let service: LocationValidationService;

  const loggerMock = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  // No GOOGLE_MAPS_API_KEY: the service goes straight to Nominatim.
  const configMock = { get: jest.fn(() => undefined) };

  const algiers = {
    display_name: 'Alger, Algérie',
    lat: '36.7538',
    lon: '3.0588',
    address: { city: 'Alger', country_code: 'dz' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LocationValidationService(configMock as any, loggerMock as any);
  });

  describe('validateLocation', () => {
    it('rejects empty, too short, and missing locations', async () => {
      await expect(service.validateLocation('')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.validateLocation('a')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.validateLocation(null as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an address longer than any real address without calling the geocoder', async () => {
      await expect(service.validateLocation('a'.repeat(501))).rejects.toThrow(/longer than 500/);
      // Long runs of separators used to make the clean-up take quadratic time.
      await expect(service.validateLocation(`x${', '.repeat(200_000)}y`)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('cleans stray commas and spaces around the address before looking it up', async () => {
      mockedAxios.get.mockResolvedValue({ data: [algiers] });

      await service.validateLocation(' , Alger ,, ');

      const firstQuery = decodeURIComponent(String(mockedAxios.get.mock.calls[0][0]));
      expect(firstQuery).toContain('q=Alger, Algeria');
    });

    it('returns the geocoded address for a known location', async () => {
      mockedAxios.get.mockResolvedValue({ data: [algiers] });

      const result = await service.validateLocation('Alger');

      expect(result).toEqual({
        isValid: true,
        formattedAddress: 'Alger, Algérie',
        confidence: 1,
        coordinates: { lat: 36.7538, lon: 3.0588 },
      });
    });

    it('returns invalid when the geocoder finds nothing', async () => {
      mockedAxios.get.mockResolvedValue({ data: [] });

      const result = await service.validateLocation('nonexistent place');

      expect(result).toEqual({ isValid: false });
    });

    it('serves repeated lookups from the cache', async () => {
      mockedAxios.get.mockResolvedValue({ data: [algiers] });

      await service.validateLocation('Alger');
      await service.validateLocation('  alger ');

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it('does not report a geocoder outage as an invalid address', async () => {
      mockedAxios.get.mockRejectedValue(new Error('connect ECONNREFUSED'));

      const result = await service.validateLocation('Alger');

      expect(result).toEqual({ isValid: true, unverified: true, formattedAddress: 'Alger' });
    });

    it('checks again once the geocoder is back, instead of caching the outage', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
      await service.validateLocation('Alger');

      mockedAxios.get.mockResolvedValue({ data: [algiers] });
      const result = await service.validateLocation('Alger');

      expect(result.unverified).toBeUndefined();
      expect(result.formattedAddress).toBe('Alger, Algérie');
    });
  });

  describe('validateLocationWithMessage', () => {
    it('returns a localized message when the address is not found', async () => {
      mockedAxios.get.mockResolvedValue({ data: [] });

      const result = await service.validateLocationWithMessage('nonexistent place', 'en');

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('could not be found');
    });
  });

  describe('validateLocationsBatch', () => {
    it('returns one flat result per location and tolerates bad input', async () => {
      mockedAxios.get.mockResolvedValue({ data: [algiers] });

      const results = await service.validateLocationsBatch(['Alger', '']);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ location: 'Alger', isValid: true });
      expect(results[1]).toEqual({ location: '', isValid: false });
    });
  });
});
