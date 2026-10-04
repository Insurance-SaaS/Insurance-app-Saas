import { RedisCheckpointSaver } from './redis-checkpoint-saver';

function memoryStore() {
  const data = new Map<string, { value: string; ttl?: number }>();
  return {
    data,
    get: async (key: string) => data.get(key)?.value ?? null,
    set: async (key: string, value: string, ttl?: number) => void data.set(key, { value, ttl }),
    del: async (key: string) => data.delete(key),
  };
}

const checkpoint = (id: string) =>
  ({
    v: 4,
    id,
    ts: new Date().toISOString(),
    channel_values: { counter: id },
    channel_versions: {},
    versions_seen: {},
  }) as any;

const thread = (id: string, checkpointId?: string) => ({
  configurable: { thread_id: id, checkpoint_ns: '', ...(checkpointId ? { checkpoint_id: checkpointId } : {}) },
});

describe('RedisCheckpointSaver', () => {
  it('returns the latest checkpoint of a thread, from the store', async () => {
    const store = memoryStore();
    const saver = new RedisCheckpointSaver(store);

    await saver.put(thread('acme:u1:s1'), checkpoint('001'), { source: 'input', step: 0, parents: {} } as any);
    await saver.put(thread('acme:u1:s1', '001'), checkpoint('002'), { source: 'loop', step: 1, parents: {} } as any);

    // A second saver sharing the store stands for another application instance.
    const tuple = await new RedisCheckpointSaver(store).getTuple(thread('acme:u1:s1'));

    expect(tuple?.checkpoint.id).toBe('002');
    expect(tuple?.checkpoint.channel_values).toEqual({ counter: '002' });
    expect(tuple?.parentConfig?.configurable?.checkpoint_id).toBe('001');
  });

  it('keeps threads apart', async () => {
    const store = memoryStore();
    const saver = new RedisCheckpointSaver(store);
    await saver.put(thread('acme:u1:s1'), checkpoint('001'), { step: 0 } as any);

    expect(await saver.getTuple(thread('acme:u2:s1'))).toBeUndefined();
    expect(await saver.getTuple(thread('globex:u1:s1'))).toBeUndefined();
  });

  it('keeps only the most recent checkpoints and sets an expiry', async () => {
    const store = memoryStore();
    const saver = new RedisCheckpointSaver(store, 3600, 2);

    let parent: string | undefined;
    for (const id of ['001', '002', '003', '004', '005']) {
      await saver.put(thread('acme:u1:s1', parent), checkpoint(id), { step: 0 } as any);
      parent = id;
    }

    const stored = store.data.get('ai:thread:acme:u1:s1')!;
    expect(Object.keys(JSON.parse(stored.value).storage['']).sort()).toEqual(['004', '005']);
    expect(stored.ttl).toBe(3600);
  });

  it('keeps pending writes with their checkpoint', async () => {
    const store = memoryStore();
    const saver = new RedisCheckpointSaver(store);
    await saver.put(thread('acme:u1:s1'), checkpoint('001'), { step: 0 } as any);
    await saver.putWrites(thread('acme:u1:s1', '001'), [['channel', { value: 42 }]], 'task-1');

    const tuple = await saver.getTuple(thread('acme:u1:s1'));

    expect(tuple?.pendingWrites).toEqual([['task-1', 'channel', { value: 42 }]]);
  });

  it('forgets a thread', async () => {
    const store = memoryStore();
    const saver = new RedisCheckpointSaver(store);
    await saver.put(thread('acme:u1:s1'), checkpoint('001'), { step: 0 } as any);

    await saver.deleteThread('acme:u1:s1');

    expect(await saver.getTuple(thread('acme:u1:s1'))).toBeUndefined();
    expect(store.data.size).toBe(0);
  });
});
