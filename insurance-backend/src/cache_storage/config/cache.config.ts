import { registerAs } from '@nestjs/config';

export default registerAs('cache', () => ({
  // Redis connection settings
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number.parseInt(process.env.REDIS_DB || '0', 10),
    tls: process.env.REDIS_TLS === 'true',
  },

  // TTL settings in seconds
  ttl: {
    // Claims data - 120 minutes (2 hours)
    claims: Number.parseInt(process.env.REDIS_TTL_CLAIMS || '7200', 10),

    // Quotes data - 30 minutes (quotes change frequently)
    quotes: Number.parseInt(process.env.REDIS_TTL_QUOTES || '1800', 10),

    // Users data - 2 minutes
    users: Number.parseInt(process.env.REDIS_TTL_USERS || '120', 10),

    // ERP data - 240 minutes (4 hours, mapping data is relatively stable)
    erp: Number.parseInt(process.env.REDIS_TTL_ERP || '14400', 10),
  },
}));
