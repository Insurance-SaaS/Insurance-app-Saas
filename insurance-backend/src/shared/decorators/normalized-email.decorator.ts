import { Transform } from 'class-transformer';

/**
 * Trims and lower-cases an email before validation. Some engines compare
 * strings case-insensitively and others do not; storing and looking up one
 * canonical form makes "is this email taken" mean the same thing everywhere.
 */
export const NormalizedEmail = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

export function normalizeEmail<T extends string | null | undefined>(email: T): T {
  return (typeof email === 'string' ? email.trim().toLowerCase() : email) as T;
}
