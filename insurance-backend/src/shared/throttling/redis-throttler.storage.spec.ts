import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('RedisThrottlerStorage', () => {
  const evalMock = jest.fn();
  const storage = new RedisThrottlerStorage({ getClient: () => ({ eval: evalMock }) } as any);

  beforeEach(() => evalMock.mockReset());

  it('reports the window and the block in seconds', async () => {
    evalMock.mockResolvedValue([6, 59_001, 1, 60_000]);

    const record = await storage.increment('client', 60_000, 5, 0, 'medium');

    expect(record).toEqual({ totalHits: 6, timeToExpire: 60, isBlocked: true, timeToBlockExpire: 60 });
    // Keys are namespaced; without a block duration the window length is used.
    expect(evalMock).toHaveBeenCalledWith(
      expect.any(String),
      2,
      'throttle:medium:client:hits',
      'throttle:medium:client:blocked',
      60_000,
      5,
      60_000,
    );
  });

  it('lets the request through when Redis cannot be reached', async () => {
    evalMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const record = await storage.increment('client', 60_000, 5, 0, 'medium');

    expect(record.isBlocked).toBe(false);
  });
});
