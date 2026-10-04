import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TokenUsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  content: string;
  usage?: TokenUsageInfo;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  maxContextTokens?: number;
  retries?: number;
}

export type LlmErrorType =
  | 'AUTH_ERROR'
  | 'RATE_LIMIT_EXCEEDED'
  | 'QUOTA_EXCEEDED'
  | 'MODEL_UNAVAILABLE'
  | 'TIMEOUT_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

/** An LLM call that failed, classified so callers can map it to an HTTP status. */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly type: LlmErrorType,
    /** HTTP status returned by the provider, when there was one. */
    readonly status?: number,
    readonly originalError?: unknown,
  ) {
    super(message);
  }

  /** Worth another attempt: the provider was busy or unreachable. */
  get retryable(): boolean {
    return (
      this.type === 'RATE_LIMIT_EXCEEDED' ||
      this.type === 'TIMEOUT_ERROR' ||
      this.type === 'NETWORK_ERROR' ||
      this.type === 'MODEL_UNAVAILABLE' ||
      (this.type === 'UNKNOWN_ERROR' && (this.status === undefined || this.status >= 500))
    );
  }
}

/**
 * Client for an OpenAI-compatible chat API. Everything provider-specific comes
 * from configuration, so OpenAI, Azure OpenAI, GitHub Models or a self-hosted
 * gateway are a matter of settings:
 *
 *   OPENAI_API_KEY      required to use the assistant (the app starts without it)
 *   OPENAI_BASE_URL     optional, for a compatible provider
 *   OPENAI_MODEL        default gpt-4o
 *   OPENAI_TIMEOUT_MS   per-request timeout, default 30000
 *   OPENAI_JSON_MODE    set to false for providers without response_format support
 */
@Injectable()
export class OpenAIClientService {
  private readonly logger = new Logger(OpenAIClientService.name);
  private client?: OpenAI;
  private readonly model: string;
  private readonly timeoutMs: number;
  /** Ask for JSON with response_format. Turn off for providers that do not support it. */
  private readonly jsonMode: boolean;
  private readonly maxContextWindow = 128000;

  constructor(private readonly configService: ConfigService) {
    this.model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o';
    this.timeoutMs = Number.parseInt(this.configService.get<string>('OPENAI_TIMEOUT_MS') || '30000', 10);
    this.jsonMode = this.configService.get<string>('OPENAI_JSON_MODE') !== 'false';
  }

  /** Created on first use, so a deployment without the assistant still boots. */
  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        throw new LlmError(
          'The AI assistant is not configured (OPENAI_API_KEY is missing).',
          'AUTH_ERROR',
        );
      }
      this.client = new OpenAI({
        apiKey,
        baseURL: this.configService.get<string>('OPENAI_BASE_URL') || undefined,
        timeout: this.timeoutMs,
        // Retries are handled here, with knowledge of which errors are worth retrying.
        maxRetries: 0,
      });
    }
    return this.client;
  }

  private estimateTokens(text: string): number {
    const words = text.split(/\s+/).length;
    const chars = text.length;
    return Math.ceil((words * 1.3 + chars / 4) / 2);
  }

  estimateMessageTokens(messages: ChatMessage[]): { estimatedTokens: number; messageCount: number } {
    const totalTokens = messages.reduce(
      (total, msg) => total + this.estimateTokens(msg.content) + 4,
      3,
    );
    return { estimatedTokens: totalTokens, messageCount: messages.length };
  }

  /** Drops the oldest conversation messages until the estimate fits the budget. */
  pruneMessagesToFitBudget(messages: ChatMessage[], maxTokens = 100000): ChatMessage[] {
    if (this.estimateMessageTokens(messages).estimatedTokens <= maxTokens) {
      return messages;
    }

    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversation = messages.filter((m) => m.role !== 'system');

    let currentTokens = this.estimateMessageTokens(systemMessages).estimatedTokens;
    const kept: ChatMessage[] = [];
    for (let i = conversation.length - 1; i >= 0; i--) {
      const tokens = this.estimateTokens(conversation[i].content) + 4;
      if (currentTokens + tokens > maxTokens) break;
      kept.unshift(conversation[i]);
      currentTokens += tokens;
    }
    return [...systemMessages, ...kept];
  }

  private toResponse(response: OpenAI.Chat.Completions.ChatCompletion): ChatCompletionResponse {
    const choice = response.choices?.[0];
    if (!choice) {
      throw new Error('No response from the model');
    }
    return {
      content: choice.message?.content || '',
      usage: response.usage
        ? {
            prompt_tokens: response.usage.prompt_tokens || 0,
            completion_tokens: response.usage.completion_tokens || 0,
            total_tokens: response.usage.total_tokens || 0,
          }
        : undefined,
    };
  }

  /** One attempt, no retry. */
  async chatCompletion(
    messages: ChatMessage[],
    options?: ChatOptions & { json?: boolean },
  ): Promise<ChatCompletionResponse> {
    try {
      const pruned = this.pruneMessagesToFitBudget(messages, options?.maxContextTokens || 100000);
      const response = await this.getClient().chat.completions.create({
        model: this.model,
        messages: pruned.map((msg) => ({ role: msg.role, content: msg.content })),
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 512,
        ...(options?.json && this.jsonMode
          ? { response_format: { type: 'json_object' as const } }
          : {}),
      });
      return this.toResponse(response);
    } catch (error) {
      throw this.classify(error);
    }
  }

  /** Retries with exponential backoff, but only errors that can succeed on a retry. */
  async chatCompletionWithRetry(
    messages: ChatMessage[],
    options?: ChatOptions & { json?: boolean },
  ): Promise<ChatCompletionResponse> {
    const attempts = options?.retries ?? 3;
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await this.chatCompletion(messages, options);
      } catch (error) {
        lastError = error;
        if (!(error instanceof LlmError) || !error.retryable || attempt === attempts - 1) {
          throw error;
        }
        const delay = Math.pow(2, attempt) * 1000;
        this.logger.warn(`LLM call failed (${error.type}); retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  /**
   * Asks for a JSON object and parses it. The model is told to answer in JSON
   * (response_format); the parser still tolerates code fences and surrounding
   * text, which some compatible providers add.
   */
  async chatJson<T = Record<string, any>>(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<{ data: T; usage?: TokenUsageInfo }> {
    const response = await this.chatCompletionWithRetry(messages, { ...options, json: true });
    return { data: parseJsonObject<T>(response.content), usage: response.usage };
  }

  async analyzeImageWithText(
    textPrompt: string,
    imageBase64: string,
    imageMimeType: string,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<ChatCompletionResponse> {
    return this.analyzeImagesInBatch(
      textPrompt,
      [{ base64: imageBase64, mimeType: imageMimeType }],
      { maxTokens: 1024, ...options },
    );
  }

  async analyzeImagesInBatch(
    textPrompt: string,
    images: Array<{ base64: string; mimeType: string }>,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<ChatCompletionResponse> {
    try {
      const response = await this.getClient().chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: textPrompt },
              ...images.map((img) => ({
                type: 'image_url' as const,
                image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
              })),
            ],
          },
        ],
        temperature: options?.temperature ?? 0.5,
        max_tokens: options?.maxTokens ?? 2048,
      });
      return this.toResponse(response);
    } catch (error) {
      throw this.classify(error);
    }
  }

  /** Converts LangChain message objects to the plain chat format. */
  convertLangChainMessages(langChainMessages: any[]): ChatMessage[] {
    return langChainMessages.map((msg) => {
      const type = msg._getType();
      const roles: Record<string, ChatMessage['role']> = { ai: 'assistant', system: 'system' };
      return { role: roles[type as string] ?? 'user', content: msg.content as string };
    });
  }

  private classify(error: any): LlmError {
    if (error instanceof LlmError) {
      return error;
    }
    const message: string = error?.message || String(error);
    const status: number | undefined = typeof error?.status === 'number' ? error.status : undefined;
    const text = `${message} ${error?.code ?? ''} ${error?.type ?? ''}`.toLowerCase();
    const make = (userMessage: string, type: LlmErrorType) =>
      new LlmError(userMessage, type, status, error);

    this.logger.error(`LLM call failed: ${message}`);

    if (text.includes('insufficient_quota') || text.includes('quota') || text.includes('billing')) {
      return make('The AI provider quota is exhausted. Please try again later.', 'QUOTA_EXCEEDED');
    }
    if (status === 429 || text.includes('rate_limit')) {
      return make('The AI provider is rate limiting requests. Please wait a moment.', 'RATE_LIMIT_EXCEEDED');
    }
    if (status === 401 || status === 403 || text.includes('invalid_api_key')) {
      return make('The AI provider rejected the credentials.', 'AUTH_ERROR');
    }
    if (text.includes('model_not_found') || text.includes('model_unavailable')) {
      return make('The AI model is currently unavailable.', 'MODEL_UNAVAILABLE');
    }
    if (error?.name === 'APIConnectionTimeoutError' || text.includes('timeout') || text.includes('timed out')) {
      return make('The AI provider did not answer in time.', 'TIMEOUT_ERROR');
    }
    if (
      error?.name === 'APIConnectionError' ||
      text.includes('network') ||
      text.includes('econnrefused') ||
      text.includes('enotfound')
    ) {
      return make('Could not reach the AI provider.', 'NETWORK_ERROR');
    }
    return make(`The AI provider returned an error: ${message}`, 'UNKNOWN_ERROR');
  }

  getServiceInfo(): { model: string; maxContextWindow: number } {
    return { model: this.model, maxContextWindow: this.maxContextWindow };
  }
}

// Model answers are searched with plain string operations: their content is
// steered by what users type, and a backtracking expression over it is a way
// to make one request burn seconds of CPU.

/** The outermost `{...}` of a text: from the first "{" to the last "}". */
export function outermostJsonObject(content: string): string | null {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  return start !== -1 && end > start ? content.slice(start, end + 1) : null;
}

/** The content of the first ```json fenced block, if the text has one. */
export function fencedJsonBlock(content: string): string | null {
  const fence = '```';
  const open = content.indexOf(`${fence}json`);
  if (open === -1) {
    return null;
  }
  const start = open + fence.length + 'json'.length;
  const close = content.indexOf(fence, start);
  return close === -1 ? null : content.slice(start, close).trim();
}

/** Parses a JSON object out of a model answer, tolerating code fences and stray text. */
export function parseJsonObject<T = Record<string, any>>(content: string): T {
  const stripped = content.replaceAll('```json', '').replaceAll('```', '').trim();
  return JSON.parse(outermostJsonObject(stripped) ?? stripped) as T;
}
