import { Logger } from '@nestjs/common';
import { AppLogger } from './app-logger.service';

describe('AppLogger', () => {
  const logger = new AppLogger();

  afterEach(() => jest.restoreAllMocks());

  it('prints one line under the given context, with details as JSON', () => {
    const log = jest.spyOn(Logger, 'log').mockImplementation();

    logger.log('Completed GET /health', 'HTTP', { statusCode: 200 });

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('Completed GET /health {"statusCode":200}', 'HTTP');
  });

  it('never passes an empty context or stack on, which used to print "undefined" lines', () => {
    const warn = jest.spyOn(Logger, 'warn').mockImplementation();
    const error = jest.spyOn(Logger, 'error').mockImplementation();

    logger.warn('Geocoding unavailable');
    logger.error('Request failed', undefined, 'HTTP');
    logger.error('Request failed', 'Error: boom\n    at handler');

    expect(warn).toHaveBeenCalledWith('Geocoding unavailable', 'App');
    expect(error).toHaveBeenNthCalledWith(1, 'Request failed', 'HTTP');
    expect(error).toHaveBeenNthCalledWith(2, 'Request failed | Error: boom\n    at handler', 'App');
  });
});
