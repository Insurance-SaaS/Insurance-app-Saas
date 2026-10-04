/**
 * MinIO Bucket Names Configuration
 *
 * Centralized configuration for all MinIO buckets used in the application.
 * Environment variables can override these defaults.
 */

export const MINIO_BUCKETS = {
  /**
   * Bucket for claim-related documents (accident photos, claim documents)
   */
  CLAIMS: process.env.MINIO_BUCKET_CLAIMS || 'claims',

  /**
   * Bucket for user profile pictures
   */
  PROFILE_PICTURES: process.env.MINIO_BUCKET_PROFILE_PICTURES || 'profile-pictures',

  /**
   * Bucket for quote documents
   */
  QUOTES: process.env.MINIO_BUCKET_QUOTES || 'quotes',

  /**
   * Bucket for contract documents
   */
  CONTRACTS: process.env.MINIO_BUCKET_CONTRACTS || 'contracts',

  /**
   * Bucket for general documents
   */
  DOCUMENTS: process.env.MINIO_BUCKET_DOCUMENTS || 'documents',

  /**
   * Bucket for temporary uploads (e.g., chat images, temporary files)
   */
  TEMP: process.env.MINIO_BUCKET_TEMP || 'temp',
} as const;

/**
 * Helper function to get bucket name with environment variable support
 */
export function getBucketName(bucketKey: keyof typeof MINIO_BUCKETS): string {
  return MINIO_BUCKETS[bucketKey];
}

/**
 * List of all bucket names for initialization
 */
export const ALL_BUCKETS = Object.values(MINIO_BUCKETS);
