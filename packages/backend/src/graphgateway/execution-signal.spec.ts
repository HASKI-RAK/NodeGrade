import {
  KeywordCheckNode,
  LLMNode,
  type ModelCompletionRuntime,
  SentenceTransformer,
} from '@haski/ta-lib';

describe('network node execution signals', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it.each([
    [
      'LLMNode',
      async (signal: AbortSignal) => {
        const node = new LLMNode();
        const runtime: ModelCompletionRuntime = {
          complete: async (request) => {
            await fetch('http://model-worker/v1/chat/completions', {
              signal: request.signal,
            });
            return { text: 'result', warnings: [] };
          },
        };
        node.setRuntime(runtime);
        node.executionSignal = signal;
        node.properties.model_ref = {
          providerKey: 'local',
          modelId: 'local-model',
        };
        node.properties.needs_model_selection = false;
        node.isInputConnected = jest.fn((slot: number) => slot === 0);
        node.getInputData = jest
          .fn()
          .mockReturnValue({ role: 'user', content: 'Answer' });
        await node.onExecute();
      },
    ],
    [
      'KeywordCheckNode',
      async (signal: AbortSignal) => {
        const node = new KeywordCheckNode();
        node.env = { SIMILARITY_WORKER_URL: 'http://similarity-worker' };
        node.executionSignal = signal;
        node.properties.useSemantic = true;
        node.getInputData = jest
          .fn()
          .mockReturnValueOnce('keyword')
          .mockReturnValueOnce('answer');
        await node.onExecute();
      },
    ],
    [
      'SentenceTransformer',
      async (signal: AbortSignal) => {
        const node = new SentenceTransformer();
        await node.init({ SIMILARITY_WORKER_URL: 'http://similarity-worker' });
        node.executionSignal = signal;
        node.getInputData = jest.fn().mockReturnValue('answer');
        await node.onExecute();
      },
    ],
  ])('passes AbortSignal through every %s fetch', async (_, execute) => {
    const controller = new AbortController();
    const responseBody = Object.assign([1], {
      choices: [{ message: { content: 'result' } }],
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => responseBody,
    });

    await execute(controller.signal);

    for (const [, options] of jest.mocked(global.fetch).mock.calls) {
      expect(options?.signal).toBe(controller.signal);
    }
  });
});
