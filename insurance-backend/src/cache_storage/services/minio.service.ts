import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { RedisService } from './redis.service';

@Injectable()
export class MinioService {
  private readonly logger = new Logger(MinioService.name);
  private readonly minioClient: Client;

  /** Base of the URLs stored for uploaded objects. */
  private readonly publicUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    const endpoint = this.configService.get<string>('MINIO_ENDPOINT') || 'localhost';
    const port = Number.parseInt(this.configService.get<string>('MINIO_PORT') || '9000', 10);
    const accessKey = this.configService.get<string>('MINIO_ACCESS_KEY');
    const secretKey = this.configService.get<string>('MINIO_SECRET_KEY');
    const useSSL = this.configService.get<string>('MINIO_USE_SSL') === 'true';

    if (!accessKey || !secretKey) {
      throw new Error('MINIO_ACCESS_KEY and MINIO_SECRET_KEY must be set in environment variables');
    }

    this.minioClient = new Client({
      endPoint: endpoint,
      port: port,
      useSSL: useSSL,
      accessKey: accessKey,
      secretKey: secretKey,
    });

    let publicUrl =
      this.configService.get<string>('MINIO_PUBLIC_URL') ||
      `${useSSL ? 'https' : 'http'}://${endpoint}:${port}`;
    while (publicUrl.endsWith('/')) {
      publicUrl = publicUrl.slice(0, -1);
    }
    this.publicUrl = publicUrl;

    this.logger.log(`Object storage client ready (${endpoint}:${port})`);
  }

  /**
   * Stores a file and returns its URL. The URL identifies the object; it is not
   * a public link. Give clients a time-limited link from getPresignedGetUrl().
   *
   * If the storage service cannot be reached this throws: an upload is never
   * silently written somewhere else.
   */
  async uploadFile(
    bucketName: string,
    objectName: string,
    file: Buffer,
    contentType?: string,
  ): Promise<string> {
    if (!Buffer.isBuffer(file)) {
      throw new TypeError('uploadFile expects the file content as a Buffer');
    }

    try {
      if (!(await this.minioClient.bucketExists(bucketName))) {
        await this.minioClient.makeBucket(bucketName, 'us-east-1');
      }
      await this.minioClient.putObject(bucketName, objectName, file, file.length, {
        'Content-Type': contentType || 'application/octet-stream',
      });
    } catch (error) {
      this.logger.error(
        `Upload of ${bucketName}/${objectName} failed: ${(error as any)?.code ?? ''} ${(error as Error).message}`,
      );
      throw error;
    }

    return `${this.publicUrl}/${bucketName}/${objectName}`;
  }

  /** Delete file from bucket */
  async deleteFile(fileUrl: string): Promise<void> {
    try {
      if (!fileUrl || fileUrl === 'undefined' || fileUrl === 'null') {
        this.logger.warn(`Skipping delete for invalid fileUrl: ${fileUrl}`);
        return;
      }

      if (!fileUrl.startsWith('http')) {
        this.logger.warn(`Invalid URL format: ${fileUrl}`);
        return;
      }

      const url = new URL(fileUrl);
      const [bucketName, ...objectParts] = url.pathname.split('/').filter(Boolean);
      const objectName = objectParts.join('/');

      if (!bucketName || !objectName) {
        this.logger.warn(`Could not extract bucket/object from URL: ${fileUrl}`);
        return;
      }

      await this.minioClient.removeObject(bucketName, objectName);
      this.logger.log(`✅ Deleted object ${objectName} from bucket ${bucketName}`);
    } catch (error) {
      this.logger.error(`❌ Error deleting file: ${error.message}`);
      throw error;
    }
  }

  private extractObjectKey(input: string): { bucket: string; objectKey: string } | null {
    try {
      if (!input) return null;
      if (input.startsWith('http')) {
        const url = new URL(input);
        const [bucketName, ...objectParts] = url.pathname.split('/').filter(Boolean);
        const objectName = objectParts.join('/');
        if (!bucketName || !objectName) return null;
        return { bucket: bucketName, objectKey: objectName };
      }
      // Fallback: assume profile-pictures bucket when only key provided
      return { bucket: 'profile-pictures', objectKey: input.replace(/^\//, '') };
    } catch {
      return null;
    }
  }

  /** Reads a stored object back into memory. */
  async downloadFile(objectOrUrl: string): Promise<Buffer> {
    const parsed = this.extractObjectKey(objectOrUrl);
    if (!parsed) {
      throw new Error(`Invalid object reference: ${objectOrUrl}`);
    }
    const stream = await this.minioClient.getObject(parsed.bucket, parsed.objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private buildPresignCacheKey(bucket: string, objectKey: string): string {
    return `presign:${bucket}:${objectKey}`;
  }

  async invalidatePresignedCache(objectOrUrl: string): Promise<void> {
    const parsed = this.extractObjectKey(objectOrUrl);
    if (!parsed) return;
    await this.redisService.del(this.buildPresignCacheKey(parsed.bucket, parsed.objectKey));
  }

  async getPresignedGetUrl(
    objectOrUrl: string,
    expirySeconds: number = 3600,
  ): Promise<string | null> {
    try {
      const parsed = this.extractObjectKey(objectOrUrl);
      if (!parsed) {
        this.logger.warn(`Invalid object for presign: ${objectOrUrl}`);
        return null;
      }

      const cacheKey = this.buildPresignCacheKey(parsed.bucket, parsed.objectKey);
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return cached;
      }

      const presignedUrl = await this.minioClient.presignedGetObject(
        parsed.bucket,
        parsed.objectKey,
        expirySeconds,
      );

      // Store slightly shorter TTL to reduce serving near-expiry URLs
      const storeTtl = Math.max(1, Math.floor(expirySeconds * 0.9));
      await this.redisService.set(cacheKey, presignedUrl, storeTtl);

      return presignedUrl;
    } catch (error) {
      this.logger.error(`❌ Error generating presigned URL: ${error.message}`);
      return null;
    }
  }
}
