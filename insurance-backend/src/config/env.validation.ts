import { Logger } from '@nestjs/common';
import { getDialect } from 'src/core/database/dialects';
import { platformConnectionSettings } from './database.config';

const TOKEN_SECRETS = ['JWT_SECRET_KEY', 'JWT_SECRET_KEY_REFRESH', 'JWT_PLATFORM_SECRET'];

const WHOLE_NUMBERS = [
  'PORT',
  'DB_PORT',
  'DB_POOL_SIZE',
  'TENANT_DB_POOL_SIZE',
  'TENANT_DS_IDLE_MS',
  'REDIS_PORT',
  'REDIS_DB',
  'BODY_LIMIT_BYTES',
  'UPLOAD_MAX_FILE_MB',
  'MINIO_PORT',
  'EMAIL_PORT',
  'OPENAI_TIMEOUT_MS',
];

/** Needed for the service to do its job in production; optional while developing. */
const REQUIRED_IN_PRODUCTION: Record<string, string> = {
  DB_HOST: 'the platform database would silently default to localhost',
  REDIS_HOST: 'sessions, OTP codes and rate limits are kept in Redis',
  MINIO_ENDPOINT: 'claim documents and photos are kept in object storage',
  MINIO_ACCESS_KEY: 'claim documents and photos are kept in object storage',
  MINIO_SECRET_KEY: 'claim documents and photos are kept in object storage',
  EMAIL_HOST: 'sign-up and password reset send their codes by email',
  EMAIL_USER: 'sign-up and password reset send their codes by email',
  EMAIL_PASS: 'sign-up and password reset send their codes by email',
};

/** Features that are simply switched off when their setting is missing. */
const OPTIONAL_FEATURES: Record<string, string> = {
  OPENAI_API_KEY: 'the AI assistant answers that it is unavailable',
  INFOBIP_API_KEY: 'SMS codes cannot be sent',
  GOOGLE_CLIENT_ID: 'Google sign-in is disabled',
  GOOGLE_MAPS_API_KEY: 'addresses are checked with OpenStreetMap only',
};

export interface EnvReport {
  problems: string[];
  warnings: string[];
}

type Env = (key: string) => string | undefined;

function databaseProblems(env: Env): string[] {
  try {
    getDialect(env('DB_TYPE') || 'postgres');
  } catch (error) {
    return [`DB_TYPE: ${(error as Error).message}`];
  }
  const database = platformConnectionSettings(env);
  return [
    ...(database.username ? [] : ['DB_USER is required']),
    ...(database.database ? [] : ['DB_NAME is required']),
  ];
}

/**
 * The token secrets must differ: a platform token must never verify with the
 * tenant secret, nor a refresh token with the access-token secret.
 */
function secretProblems(env: Env, production: boolean): string[] {
  const problems: string[] = [];
  const present: string[] = [];
  for (const name of TOKEN_SECRETS) {
    const value = env(name);
    if (!value) {
      problems.push(`${name} is required`);
      continue;
    }
    present.push(value);
    if (production && value.length < 32) {
      problems.push(`${name} must be at least 32 characters in production`);
    }
  }
  if (new Set(present).size !== present.length) {
    problems.push(`${TOKEN_SECRETS.join(', ')} must be three different values`);
  }

  // The key that encrypts the tenants' database passwords.
  const encryptionKey = env('TENANT_DB_ENCRYPTION_KEY');
  if (!encryptionKey) {
    problems.push('TENANT_DB_ENCRYPTION_KEY is required');
  } else if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
    problems.push('TENANT_DB_ENCRYPTION_KEY must be 64 hexadecimal characters (32 bytes)');
  }
  return problems;
}

function formatProblems(env: Env): string[] {
  const problems = WHOLE_NUMBERS.filter((name) => {
    const value = env(name);
    return value !== undefined && !/^\d+$/.test(value);
  }).map((name) => `${name} must be a whole number`);

  const timeZone = env('DEFAULT_TIMEZONE');
  if (timeZone) {
    try {
      new Intl.DateTimeFormat('en', { timeZone });
    } catch {
      problems.push(`DEFAULT_TIMEZONE "${timeZone}" is not a known time zone (example: Africa/Algiers)`);
    }
  }
  return problems;
}

/** Everything wrong with the environment, without throwing. */
export function inspectEnv(config: Record<string, unknown>): EnvReport {
  const env: Env = (key) => {
    const value = config[key];
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return typeof value === 'string' && value !== '' ? value : undefined;
  };
  const production = env('NODE_ENV') === 'production';
  const unset = (settings: Record<string, string>) =>
    Object.entries(settings)
      .filter(([name]) => !env(name))
      .map(([name, consequence]) => `${name} is not set: ${consequence}`);

  // What production cannot run without is only worth a warning while developing.
  const missingForProduction = unset(REQUIRED_IN_PRODUCTION);
  return {
    problems: [
      ...databaseProblems(env),
      ...secretProblems(env, production),
      ...formatProblems(env),
      ...(production ? missingForProduction : []),
    ],
    warnings: [...(production ? [] : missingForProduction), ...unset(OPTIONAL_FEATURES)],
  };
}

/**
 * Checks the environment once, at boot, and reports every problem together:
 * a missing or weak setting stops the process here instead of surfacing later
 * as a failing request. Used as the `validate` option of ConfigModule.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const { problems, warnings } = inspectEnv(config);

  if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n - ${problems.join('\n - ')}`);
  }
  if (config.NODE_ENV !== 'test') {
    const logger = new Logger('Configuration');
    warnings.forEach((warning) => logger.warn(warning));
  }
  return config;
}
