import { Injectable, Logger } from '@nestjs/common';
import { MinioService } from './minio.service';
import { IStorageService } from 'src/contracts/interfaces/i-storage.service';

/**
 * Storage service implementing the IStorageService contract.
 *
 * Wraps MinioService behind a clean interface so consumers never
 * depend on MinIO directly. Swappable to S3, Azure Blob, local FS, etc.
 */
@Injectable()
export class StorageService implements IStorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly minio: MinioService) {}

  async upload(bucket: string, key: string, file: Buffer, contentType?: string): Promise<string> {
    return this.minio.uploadFile(bucket, key, file, contentType);
  }

  async delete(fileUrl: string): Promise<void> {
    return this.minio.deleteFile(fileUrl);
  }

  async getSignedUrl(fileUrl: string, expirySeconds: number = 3600): Promise<string | null> {
    return this.minio.getPresignedGetUrl(fileUrl, expirySeconds);
  }

  async invalidateSignedUrlCache(fileUrl: string): Promise<void> {
    return this.minio.invalidatePresignedCache(fileUrl);
  }
}
