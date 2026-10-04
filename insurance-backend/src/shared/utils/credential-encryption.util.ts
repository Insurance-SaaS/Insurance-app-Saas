import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
/** Marks a stored value as encrypted by this module (and with which format). */
const PREFIX = 'enc:v1:';

/**
 * AES-256-GCM encryption for tenant database credentials.
 *
 * Stored format: "enc:v1:" + base64(iv + authTag + ciphertext)
 * Key must be a 32-byte hex string from TENANT_DB_ENCRYPTION_KEY env var.
 */

function getKeyBuffer(hexKey: string): Buffer {
  if (hexKey?.length !== 64) {
    throw new Error(
      'TENANT_DB_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
        "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return Buffer.from(hexKey, 'hex');
}

export function encryptCredential(plaintext: string, hexKey: string): string {
  const key = getKeyBuffer(hexKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: iv (16) + authTag (16) + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return PREFIX + packed.toString('base64');
}

/** Throws if the value is not in the encrypted format or was not encrypted with this key. */
export function decryptCredential(encoded: string, hexKey: string): string {
  if (!isEncrypted(encoded)) {
    throw new Error('Value is not an encrypted credential');
  }
  const key = getKeyBuffer(hexKey);
  const packed = Buffer.from(encoded.slice(PREFIX.length), 'base64');

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/** True for values produced by encryptCredential(). Anything else is plaintext. */
export function isEncrypted(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}
