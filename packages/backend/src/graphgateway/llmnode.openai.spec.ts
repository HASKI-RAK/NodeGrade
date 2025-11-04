import { LLMNode } from '@haski/ta-lib';

describe('LLMNode OpenAI integration', () => {
  const originalFetch = (global as any).fetch as jest.Mock | undefined;

  afterEach(() => {
    // restore fetch after each test
    if (originalFetch) {
      (global as any).fetch = originalFetch;
    } else {
      delete (global as any).fetch;
    }
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('merges local and OpenAI models on init and records sources', async () => {
    const node = new LLMNode();

    // Mock fetch for both endpoints used during init
    (global as any).fetch = jest.fn(async (url: string, options?: any) => {
      if (typeof url === 'string' && url.endsWith('/v1/models')) {
        // Local worker models
        if (String(url).startsWith('http://local-worker')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              object: 'list',
              data: [
                { id: 'local-1', object: 'model', created: 0, owned_by: 'me' },
              ],
            }),
          } as any;
        }
        // OpenAI models
        if (String(url).startsWith('https://api.openai.com')) {
          expect(options?.headers?.Authorization).toMatch(/^Bearer /);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              object: 'list',
              data: [
                {
                  id: 'gpt-5',
                  object: 'model',
                  created: 0,
                  owned_by: 'openai',
                },
                {
                  id: 'gpt-4o',
                  object: 'model',
                  created: 0,
                  owned_by: 'openai',
                },
              ],
            }),
          } as any;
        }
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    });

    await node.init({
      MODEL_WORKER_URL: 'http://local-worker',
      OPENAI_API_KEY: 'sk-test',
    });

    const models = (node as any).models as string[];
    expect(models).toEqual(
      expect.arrayContaining(['local-1', 'gpt-5', 'gpt-4o']),
    );

    const srcMap = ((node as any).properties as any)
      .available_model_sources as Record<string, string>;
    expect(srcMap['local-1']).toBe('local');
    expect(srcMap['gpt-5']).toBe('openai');
    expect(srcMap['gpt-4o']).toBe('openai');
  });

  it('routes execution to OpenAI for OpenAI models and to local for local models', async () => {
    const node = new LLMNode();

    // Override getInputData to provide a single message
    const message = { role: 'user', content: 'Hello' } as any;
    (node as any).getInputData = jest
      .fn()
      // port 0 -> message
      .mockReturnValueOnce(message)
      // port 1 -> messages array (unused when message provided)
      .mockReturnValueOnce(undefined);

    // Track which endpoint was called
    const calls: string[] = [];

    (global as any).fetch = jest.fn(async (url: string, options?: any) => {
      calls.push(url);

      // Init phase model fetching
      if (url === 'http://local-worker/v1/models') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ object: 'list', data: [{ id: 'local-1' }] }),
        } as any;
      }
      if (url === 'https://api.openai.com/v1/models') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ object: 'list', data: [{ id: 'gpt-5' }] }),
        } as any;
      }

      // Execution phase
      if (url === 'https://api.openai.com/v1/responses') {
        expect(options?.headers?.Authorization).toBe('Bearer sk-test');
        // Ensure token param name is max_completion_tokens
        const bodyObj = JSON.parse(options?.body ?? '{}');
        expect(bodyObj.max_completion_tokens).toBeDefined();
        expect(bodyObj.max_tokens).toBeUndefined();
        expect(bodyObj.max_output_tokens).toBeUndefined();
        return {
          ok: true,
          status: 200,
          json: async () => ({ output_text: 'OpenAI says hi' }),
        } as any;
      }
      if (url === 'http://local-worker/v1/chat/completions') {
        expect(options?.headers?.['Content-Type']).toBe('application/json');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: 'Local says hi' } }],
          }),
        } as any;
      }

      throw new Error(`Unexpected fetch url: ${url}`);
    });

    await node.init({
      MODEL_WORKER_URL: 'http://local-worker',
      OPENAI_API_KEY: 'sk-test',
    });

    // Route to OpenAI when selecting OpenAI model
    (node as any).properties.model = 'gpt-5';
    await node.onExecute();
    expect((node as any).properties.value).toBe('OpenAI says hi');
    expect(calls).toContain('https://api.openai.com/v1/responses');

    // Adjust inputs again for second run (getInputData was mocked once each)
    (node as any).getInputData = jest
      .fn()
      .mockReturnValueOnce(message)
      .mockReturnValueOnce(undefined);

    // Route to local worker when selecting local model
    (node as any).properties.model = 'local-1';
    await node.onExecute();
    expect((node as any).properties.value).toBe('Local says hi');
    expect(calls).toContain('http://local-worker/v1/chat/completions');
  });

  it('falls back to legacy chat/completions when Responses API returns 400 and returns content', async () => {
    const node = new LLMNode();

    const message = { role: 'user', content: 'Hi' } as any;
    (node as any).getInputData = jest
      .fn()
      .mockReturnValueOnce(message)
      .mockReturnValueOnce(undefined);

    const calls: Array<{ url: string; options?: any }> = [];

    (global as any).fetch = jest.fn(async (url: string, options?: any) => {
      calls.push({ url, options });
      if (url === 'http://local-worker/v1/models') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ object: 'list', data: [] }),
        } as any;
      }
      if (url === 'https://api.openai.com/v1/models') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ object: 'list', data: [{ id: 'gpt-5' }] }),
        } as any;
      }
      if (url === 'https://api.openai.com/v1/responses') {
        // Simulate 400 invalid param from Responses API
        return {
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: async () =>
            JSON.stringify({ error: { message: 'Unknown parameter' } }),
        } as any;
      }
      if (url === 'https://api.openai.com/v1/chat/completions') {
        // Legacy endpoint returns content
        const legacyBody = JSON.parse(options?.body ?? '{}');
        // Ensure we sent max_completion_tokens rather than max_tokens
        expect(legacyBody.max_completion_tokens).toBeDefined();
        expect(legacyBody.max_tokens).toBeUndefined();
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: 'Legacy OK' } }],
          }),
        } as any;
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    });

    await node.init({
      MODEL_WORKER_URL: 'http://local-worker',
      OPENAI_API_KEY: 'sk-test',
    });
    (node as any).properties.model = 'gpt-5';
    await node.onExecute();

    expect((node as any).properties.value).toBe('Legacy OK');

    const responsesCall = calls.find(
      (c) => c.url === 'https://api.openai.com/v1/responses',
    );
    const legacyCall = calls.find(
      (c) => c.url === 'https://api.openai.com/v1/chat/completions',
    );
    expect(responsesCall).toBeTruthy();
    expect(legacyCall).toBeTruthy();
    // Ensure we did NOT send presence_penalty on Responses API (filtered out)
    expect(JSON.stringify(responsesCall?.options?.body || '')).not.toContain(
      'presence_penalty',
    );
  });
});
