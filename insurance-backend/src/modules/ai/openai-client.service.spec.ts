import {
  fencedJsonBlock,
  LlmError,
  OpenAIClientService,
  outermostJsonObject,
  parseJsonObject,
} from './openai-client.service';

describe('parseJsonObject', () => {
  it('parses plain JSON, fenced JSON and JSON inside prose', () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonObject('Here you go: {"a":{"b":2}} hope it helps')).toEqual({ a: { b: 2 } });
  });

  it('finds a fenced block and the outermost object without a regular expression', () => {
    expect(fencedJsonBlock('Analyse.\n```json\n{"a":1}\n```\nMerci')).toBe('{"a":1}');
    expect(fencedJsonBlock('no fence')).toBeNull();
    expect(fencedJsonBlock('```json {"a":1}')).toBeNull();
    expect(outermostJsonObject('x {"a":{"b":2}} y')).toBe('{"a":{"b":2}}');
    expect(outermostJsonObject('} nothing {')).toBeNull();
  });

  it('stays fast on an answer made of thousands of unclosed braces', () => {
    const hostile = '{'.repeat(200_000);
    const started = Date.now();

    expect(outermostJsonObject(hostile)).toBeNull();
    expect(() => parseJsonObject(hostile)).toThrow();
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('throws on text without an object', () => {
    expect(() => parseJsonObject('no json here')).toThrow();
  });
});

describe('OpenAIClientService', () => {
  const config = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as any;
  const completion = { choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } };

  function clientWith(create: jest.Mock, values: Record<string, string> = { OPENAI_API_KEY: 'k' }) {
    const service = new OpenAIClientService(config(values));
    (service as any).client = { chat: { completions: { create } } };
    return service;
  }

  beforeEach(() => {
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0 as any;
    }) as any);
  });

  afterEach(() => jest.restoreAllMocks());

  it('starts without a key and fails clearly on first use', async () => {
    const service = new OpenAIClientService(config({}));

    await expect(service.chatCompletion([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      type: 'AUTH_ERROR',
    });
  });

  it('uses the configured model and asks for JSON only when told to', async () => {
    const create = jest.fn().mockResolvedValue(completion);
    const service = clientWith(create, { OPENAI_API_KEY: 'k', OPENAI_MODEL: 'my-model' });

    await service.chatCompletion([{ role: 'user', content: 'hi' }]);
    await service.chatCompletion([{ role: 'user', content: 'hi' }], { json: true });

    expect(create.mock.calls[0][0]).toMatchObject({ model: 'my-model' });
    expect(create.mock.calls[0][0].response_format).toBeUndefined();
    expect(create.mock.calls[1][0].response_format).toEqual({ type: 'json_object' });
  });

  it('retries a rate limit and then succeeds', async () => {
    const create = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('rate_limit'), { status: 429 }))
      .mockResolvedValue(completion);

    const result = await clientWith(create).chatCompletionWithRetry([{ role: 'user', content: 'hi' }]);

    expect(result.content).toBe('ok');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ status: 401, message: 'invalid_api_key' }, 'AUTH_ERROR'],
    [{ status: 429, message: 'insufficient_quota' }, 'QUOTA_EXCEEDED'],
    [{ status: 400, message: 'bad request' }, 'UNKNOWN_ERROR'],
  ])('does not retry %j', async (failure, type) => {
    const create = jest.fn().mockRejectedValue(Object.assign(new Error(failure.message), failure));

    const error = await clientWith(create)
      .chatCompletionWithRetry([{ role: 'user', content: 'hi' }])
      .catch((e) => e);

    expect(error).toBeInstanceOf(LlmError);
    expect(error.type).toBe(type);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('gives up after the configured number of attempts on a timeout', async () => {
    const create = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('Request timed out'), { name: 'APIConnectionTimeoutError' }));

    const error = await clientWith(create)
      .chatCompletionWithRetry([{ role: 'user', content: 'hi' }], { retries: 3 })
      .catch((e) => e);

    expect(error.type).toBe('TIMEOUT_ERROR');
    expect(create).toHaveBeenCalledTimes(3);
  });
});
