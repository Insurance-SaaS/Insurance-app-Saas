/**
 * IStorageService — Framework-agnostic object storage interface.
 *
 * Replaces direct MinioService injection. Implementations can be:
 * - MinioStorageProvider (current)
 * - LocalStorageProvider (filesystem fallback)
 * - S3StorageProvider (AWS)
 * - AzureBlobProvider (Azure)
 *
 * The active provider is resolved per-tenant from tenant config.
 */
export interface IStorageService {
  /**
   * Upload a file to a storage bucket.
   * @returns The public or internal URL of the uploaded file.
   */
  upload(bucket: string, key: string, file: Buffer, contentType?: string): Promise<string>;

  /**
   * Delete a file by its URL.
   */
  delete(fileUrl: string): Promise<void>;

  /**
   * Generate a time-limited signed URL for reading a file.
   * Returns null if the file doesn't exist or signing fails.
   */
  getSignedUrl(fileUrl: string, expirySeconds?: number): Promise<string | null>;

  /**
   * Invalidate any cached signed URL for the given file.
   */
  invalidateSignedUrlCache(fileUrl: string): Promise<void>;
}
