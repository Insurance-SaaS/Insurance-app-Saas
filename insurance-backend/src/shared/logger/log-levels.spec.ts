import { logLevels } from './log-levels';

describe('logLevels', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });
  const levels = (LOG_LEVEL: string | undefined, NODE_ENV = 'production') => {
    process.env.NODE_ENV = NODE_ENV;
    if (LOG_LEVEL === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = LOG_LEVEL;
    return logLevels();
  };

  it('prints the chosen level and everything more severe', () => {
    expect(levels('warn')).toEqual(['error', 'warn']);
    expect(levels('VERBOSE')).toEqual(['error', 'warn', 'log', 'debug', 'verbose']);
  });

  it('defaults to log in production and debug elsewhere', () => {
    expect(levels(undefined)).toEqual(['error', 'warn', 'log']);
    expect(levels(undefined, 'development')).toEqual(['error', 'warn', 'log', 'debug']);
    expect(levels('chatty')).toEqual(['error', 'warn', 'log']);
  });
});
