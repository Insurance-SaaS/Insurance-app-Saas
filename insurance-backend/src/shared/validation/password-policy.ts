/**
 * At least one digit, one lower-case and one upper-case letter.
 *
 * Anchored, and each condition skips only characters that cannot satisfy it,
 * so a password is checked in a single pass whatever its length.
 */
export const PASSWORD_POLICY = /^(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z])/;
