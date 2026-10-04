import { BusinessException } from 'src/shared/exceptions/business.exception';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MinioService } from 'src/cache_storage/services/minio.service';
import { RedisService } from 'src/cache_storage/services/redis.service';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { MINIO_BUCKETS } from 'src/shared/constants/minio-buckets';
import { buildTenantCacheKey } from 'src/shared/utils/cache-key.util';
import { TokenUsageInfo } from './openai-client.service';

export interface SessionTokenUsage {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  llmCalls: number;
}

/** An image kept in object storage for the duration of a conversation. */
export interface StoredImage {
  url: string;
  filename: string;
  mimetype: string;
}

const SESSION_TTL_SECONDS = 24 * 60 * 60;
const LOCK_TTL_SECONDS = 120;

/**
 * Everything about an AI conversation that lives outside the model: who owns
 * it, how much it may cost, and where its images are. All of it is in Redis or
 * object storage, namespaced by tenant, so nothing depends on which application
 * instance serves the next message.
 */
@Injectable()
export class AiSessionStore {
  constructor(
    private readonly redis: RedisService,
    private readonly tenantContext: TenantContextService,
    private readonly storage: MinioService,
    private readonly configService: ConfigService,
  ) {}

  private get tenantSlug(): string {
    return this.tenantContext.requireTenant().slug;
  }

  newSessionId(): string {
    return randomUUID();
  }

  /**
   * The conversation thread of a session. It includes the tenant and the user,
   * so a session id that belongs to someone else simply names a different,
   * empty thread: one user can never read or continue another user's conversation.
   */
  threadId(userId: string, sessionId: string): string {
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(sessionId)) {
      throw new BadRequestException('Invalid sessionId');
    }
    return `${this.tenantSlug}:${userId}:${sessionId}`;
  }

  /** Runs one message at a time per conversation; a concurrent one is refused. */
  async withLock<T>(threadId: string, work: () => Promise<T>): Promise<T> {
    const key = `ai:lock:${threadId}`;
    const token = randomUUID();
    const acquired = await this.redis.getClient().set(key, token, 'EX', LOCK_TTL_SECONDS, 'NX');
    if (acquired !== 'OK') {
      throw new ConflictException('The previous message of this conversation is still being processed');
    }
    try {
      return await work();
    } finally {
      if ((await this.redis.get(key)) === token) {
        await this.redis.del(key);
      }
    }
  }

  /**
   * Counts one user message against the daily limits and refuses it when a
   * limit is reached. Limits come from the tenant (config.ai.dailyMessagesPerUser,
   * config.ai.dailyMessages), then from AI_DAILY_MESSAGES_PER_USER /
   * AI_DAILY_MESSAGES_PER_TENANT.
   */
  async consumeMessageQuota(userId: string): Promise<void> {
    const tenant = this.tenantContext.requireTenant();
    const limits = (tenant.config?.ai ?? {}) as Record<string, unknown>;
    const limitOf = (tenantValue: unknown, envName: string, fallback: number) =>
      Number(tenantValue) || Number.parseInt(this.configService.get<string>(envName) || '', 10) || fallback;
    const perUser = limitOf(limits.dailyMessagesPerUser, 'AI_DAILY_MESSAGES_PER_USER', 200);
    const perTenant = limitOf(limits.dailyMessages, 'AI_DAILY_MESSAGES_PER_TENANT', 10000);

    const day = new Date().toISOString().slice(0, 10);
    const count = async (...parts: string[]) => {
      const key = buildTenantCacheKey(tenant.slug, 'ai', 'quota', day, ...parts);
      const value = await this.redis.incr(key);
      if (value === 1) {
        await this.redis.expire(key, 2 * 24 * 60 * 60);
      }
      return value;
    };

    if ((await count('user', userId)) > perUser || (await count('tenant')) > perTenant) {
      // The code lets a client tell this apart from ordinary rate limiting.
      throw new BusinessException(
        'The daily limit of AI assistant messages has been reached. Please try again tomorrow.',
        HttpStatus.TOO_MANY_REQUESTS,
        'AI_DAILY_LIMIT_REACHED',
      );
    }
  }

  // ── Token accounting, per conversation ─────────────────────────────

  private usageKey(threadId: string): string {
    return `ai:usage:${threadId}`;
  }

  async addUsage(threadId: string, usage?: TokenUsageInfo): Promise<void> {
    if (!usage) return;
    const key = this.usageKey(threadId);
    const client = this.redis.getClient();
    await client.hincrby(key, 'totalPromptTokens', usage.prompt_tokens);
    await client.hincrby(key, 'totalCompletionTokens', usage.completion_tokens);
    await client.hincrby(key, 'totalTokens', usage.total_tokens);
    await client.hincrby(key, 'llmCalls', 1);
    await this.redis.expire(key, SESSION_TTL_SECONDS);
  }

  async getUsage(threadId: string): Promise<SessionTokenUsage | null> {
    const raw = await this.redis.getClient().hgetall(this.usageKey(threadId));
    if (!raw || Object.keys(raw).length === 0) {
      return null;
    }
    return {
      totalPromptTokens: Number(raw.totalPromptTokens || 0),
      totalCompletionTokens: Number(raw.totalCompletionTokens || 0),
      totalTokens: Number(raw.totalTokens || 0),
      llmCalls: Number(raw.llmCalls || 0),
    };
  }

  async clear(threadId: string): Promise<void> {
    await this.redis.del(this.usageKey(threadId));
  }

  // ── Images: stored once, referenced from the conversation state ─────

  async storeImage(
    threadId: string,
    image: { buffer: Buffer; mimetype: string; filename: string },
  ): Promise<StoredImage> {
    const extension = image.mimetype.split('/')[1] || 'bin';
    const objectName = `${this.tenantSlug}/ai-sessions/${threadId.split(':').slice(1).join('/')}/${randomUUID()}.${extension}`;
    const url = await this.storage.uploadFile(
      MINIO_BUCKETS.TEMP,
      objectName,
      image.buffer,
      image.mimetype,
    );
    return { url, filename: image.filename, mimetype: image.mimetype };
  }

  loadImage(image: StoredImage): Promise<Buffer> {
    return this.storage.downloadFile(image.url);
  }

  async deleteImages(images: StoredImage[]): Promise<void> {
    await Promise.allSettled(images.map((image) => this.storage.deleteFile(image.url)));
  }
}
