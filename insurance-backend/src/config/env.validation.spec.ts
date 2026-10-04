import { inspectEnv, validateEnv } from './env.validation';

describe('environment validation', () => {
  const valid = {
    NODE_ENV: 'production',
    DB_TYPE: 'postgres',
    DB_HOST: 'db.internal',
    DB_USER: 'platform',
    DB_PASSWORD: 'x',
    DB_NAME: 'platform',
    REDIS_HOST: 'redis.internal',
    JWT_SECRET_KEY: 'a'.repeat(40),
    JWT_SECRET_KEY_REFRESH: 'b'.repeat(40),
    JWT_PLATFORM_SECRET: 'c'.repeat(40),
    TENANT_DB_ENCRYPTION_KEY: 'ab'.repeat(32),
    MINIO_ENDPOINT: 'storage.internal',
    MINIO_ACCESS_KEY: 'k',
    MINIO_SECRET_KEY: 's',
    EMAIL_HOST: 'smtp.internal',
    EMAIL_USER: 'noreply@example.com',
    EMAIL_PASS: 'p',
  };
  const problems = (overrides: Record<string, unknown>) => inspectEnv({ ...valid, ...overrides }).problems;

  it('accepts a complete production environment', () => {
    expect(problems({})).toEqual([]);
    expect(validateEnv({ ...valid, NODE_ENV: 'test' })).toMatchObject({ DB_NAME: 'platform' });
  });

  it('reports every problem at once', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(
      /DB_USER is required[\s\S]*JWT_SECRET_KEY is required[\s\S]*TENANT_DB_ENCRYPTION_KEY is required/,
    );
  });

  it('rejects an engine it cannot run on', () => {
    expect(problems({ DB_TYPE: 'mongodb' }).join()).toMatch(/DB_TYPE/);
  });

  it('requires the three token secrets to differ', () => {
    expect(problems({ JWT_PLATFORM_SECRET: valid.JWT_SECRET_KEY })).toEqual([
      'JWT_SECRET_KEY, JWT_SECRET_KEY_REFRESH, JWT_PLATFORM_SECRET must be three different values',
    ]);
  });

  it('rejects short secrets in production only', () => {
    expect(problems({ JWT_SECRET_KEY: 'short' })).toEqual([
      'JWT_SECRET_KEY must be at least 32 characters in production',
    ]);
    expect(problems({ JWT_SECRET_KEY: 'short', NODE_ENV: 'development' })).toEqual([]);
  });

  it('rejects an encryption key of the wrong shape', () => {
    expect(problems({ TENANT_DB_ENCRYPTION_KEY: 'not-hex' })).toEqual([
      'TENANT_DB_ENCRYPTION_KEY must be 64 hexadecimal characters (32 bytes)',
    ]);
  });

  it('rejects numbers that are not numbers and unknown time zones', () => {
    expect(problems({ PORT: 'http', DEFAULT_TIMEZONE: 'Mars/Olympus' })).toEqual([
      'PORT must be a whole number',
      'DEFAULT_TIMEZONE "Mars/Olympus" is not a known time zone (example: Africa/Algiers)',
    ]);
  });

  it('requires storage and email in production, and only warns while developing', () => {
    expect(problems({ MINIO_ENDPOINT: '', EMAIL_HOST: undefined })).toHaveLength(2);

    const development = inspectEnv({ ...valid, NODE_ENV: 'development', MINIO_ENDPOINT: '' });
    expect(development.problems).toEqual([]);
    expect(development.warnings.join()).toMatch(/MINIO_ENDPOINT/);
  });

  it('says which features are switched off', () => {
    expect(inspectEnv(valid).warnings.join()).toMatch(/OPENAI_API_KEY is not set: the AI assistant/);
  });
});
