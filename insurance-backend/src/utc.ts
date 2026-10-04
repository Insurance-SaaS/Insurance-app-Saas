/**
 * The application process always runs in UTC.
 *
 * Dates are stored without a time zone (no engine-neutral zoned type exists) and
 * some drivers convert them using the process time zone. Pinning the process to
 * UTC makes every engine store and return the same instant, wherever the server
 * runs. Business rules that depend on the local calendar day use the tenant's
 * time zone explicitly (see DateValidationService).
 *
 * Import this module before anything else.
 */
process.env.TZ = 'UTC';
