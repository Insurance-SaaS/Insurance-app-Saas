import { RunnableConfig } from '@langchain/core/runnables';
import {
  BaseCheckpointSaver,
  Checkpoint,
  CheckpointListOptions,
  CheckpointMetadata,
  CheckpointTuple,
  MemorySaver,
  PendingWrite,
} from '@langchain/langgraph-checkpoint';

/** The few Redis operations the saver needs. */
export interface CheckpointStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

interface ThreadSnapshot {
  /** namespace -> checkpoint id -> [checkpoint, metadata, parent id] */
  storage: Record<string, Record<string, [string, string, string | undefined]>>;
  /** JSON [thread, namespace, checkpoint id] -> write key -> [task id, channel, value] */
  writes: Record<string, Record<string, [string, string, string]>>;
}

/**
 * Keeps LangGraph conversation state in Redis instead of process memory, so a
 * conversation survives a restart, works with several application instances
 * and expires on its own.
 *
 * Each thread is one Redis value holding its most recent checkpoints. The
 * checkpoint logic itself is LangGraph's MemorySaver: a thread is loaded into
 * one, the operation is applied, and the result is written back. Only the last
 * few checkpoints are kept; this application never rewinds a conversation.
 */
export class RedisCheckpointSaver extends BaseCheckpointSaver {
  constructor(
    private readonly store: CheckpointStore,
    private readonly ttlSeconds = 24 * 60 * 60,
    private readonly keepCheckpoints = 2,
  ) {
    super();
  }

  private key(threadId: string): string {
    return `ai:thread:${threadId}`;
  }

  private threadIdOf(config: RunnableConfig): string {
    const threadId = config.configurable?.thread_id;
    if (!threadId) {
      throw new Error('The RunnableConfig is missing configurable.thread_id');
    }
    return threadId;
  }

  private async load(threadId: string): Promise<MemorySaver> {
    const memory = new MemorySaver(this.serde);
    const raw = await this.store.get(this.key(threadId));
    if (raw) {
      const snapshot = JSON.parse(raw) as ThreadSnapshot;
      (memory as any).storage[threadId] = snapshot.storage;
      Object.assign((memory as any).writes, snapshot.writes);
    }
    return memory;
  }

  private async save(threadId: string, memory: MemorySaver): Promise<void> {
    const storage: ThreadSnapshot['storage'] = (memory as any).storage[threadId] ?? {};
    const writes: ThreadSnapshot['writes'] = (memory as any).writes;
    const text = (value: unknown) =>
      typeof value === 'string' ? value : Buffer.from(value as Uint8Array).toString('utf8');

    const snapshot: ThreadSnapshot = { storage: {}, writes: {} };
    for (const [namespace, checkpoints] of Object.entries(storage)) {
      const newestFirst = Object.keys(checkpoints).sort((a, b) => b.localeCompare(a));
      snapshot.storage[namespace] = {};
      for (const id of newestFirst.slice(0, this.keepCheckpoints)) {
        const [checkpoint, metadata, parent] = checkpoints[id];
        snapshot.storage[namespace][id] = [text(checkpoint), text(metadata), parent];

        const writesKey = JSON.stringify([threadId, namespace, id]);
        if (writes[writesKey]) {
          snapshot.writes[writesKey] = Object.fromEntries(
            Object.entries(writes[writesKey]).map(([key, [taskId, channel, value]]) => [
              key,
              [taskId, channel, text(value)],
            ]),
          );
        }
      }
    }

    await this.store.set(this.key(threadId), JSON.stringify(snapshot), this.ttlSeconds);
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    return (await this.load(this.threadIdOf(config))).getTuple(config);
  }

  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    yield* (await this.load(this.threadIdOf(config))).list(config, options);
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
  ): Promise<RunnableConfig> {
    const threadId = this.threadIdOf(config);
    const memory = await this.load(threadId);
    const result = await memory.put(config, checkpoint, metadata);
    await this.save(threadId, memory);
    return result;
  }

  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    const threadId = this.threadIdOf(config);
    const memory = await this.load(threadId);
    await memory.putWrites(config, writes, taskId);
    await this.save(threadId, memory);
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.store.del(this.key(threadId));
  }
}
