/**
 * IOtpService — One-Time Password lifecycle management.
 *
 * Centralizes the generate → store → verify → invalidate flow.
 * Delivery (email/SMS) is the caller's responsibility — this service
 * only manages code generation, storage, and verification.
 */

/**
 * What a code is for; it is part of the storage key, so a code issued for one
 * purpose is never accepted for another. A new flow adds its purpose here.
 */
export type OtpPurpose =
  | 'signup-email'
  | 'signup-sms'
  | 'password-reset'
  | 'delete-account'
  | 'phone-change';

export type OtpChannel = 'email' | 'sms';

export interface IOtpService {
  /**
   * Generate and store an OTP code.
   *
   * @param purpose    - The OTP flow (e.g., 'signup-email', 'password-reset')
   * @param identifier - The unique key (email address or phone number)
   * @param channel    - Delivery channel hint ('email' or 'sms')
   * @param options    - Optional customization
   * @returns The generated code string — caller delivers it via email/SMS
   */
  generate(
    purpose: OtpPurpose,
    identifier: string,
    channel: OtpChannel,
    options?: {
      ttlSeconds?: number;
    },
  ): Promise<string>;

  /**
   * Verify an OTP code against the stored value.
   *
   * A correct code is single-use: it is invalidated on success unless
   * `consume: false` is passed (for a pre-check that a later step repeats).
   * Wrong guesses are counted; after too many the code is invalidated and a
   * new one must be requested.
   *
   * @returns true if the code matches, false otherwise
   */
  verify(
    purpose: OtpPurpose,
    identifier: string,
    code: string,
    options?: { consume?: boolean },
  ): Promise<boolean>;

  /**
   * Invalidate (delete) a stored OTP — call after successful verification
   * or when the flow is complete.
   */
  invalidate(purpose: OtpPurpose, identifier: string): Promise<void>;
}
