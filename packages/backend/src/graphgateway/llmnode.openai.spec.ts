import {
  LLMNode,
  type ModelCompletionRuntime,
  type ModelExecutionWarning,
} from '@haski/ta-lib';

/**
 * Feeds the message ports without building a graph. `getInputData` needs a
 * graph to resolve a link, so the slots a test wires are stubbed instead;
 * only the listed slots report as connected, exactly as an editor graph with
 * those wires would.
 */
const feed = (node: LLMNode, values: Record<number, unknown>): void => {
  node.isInputConnected = jest.fn((slot: number) => slot in values);
  node.getInputData = jest.fn(
    (slot: number) => values[slot],
  ) as typeof node.getInputData;
};

const ready = (values: Record<number, unknown>): LLMNode => {
  const node = new LLMNode();
  node.properties.model_ref = { providerKey: 'openai', modelId: 'model-a' };
  node.properties.needs_model_selection = false;
  feed(node, values);
  return node;
};

describe('LLMNode provider runtime', () => {
  it('executes the exact composite model reference through injected runtime', async () => {
    const complete = jest
      .fn()
      .mockResolvedValue({ text: 'hello', warnings: [] });
    const node = ready({ 0: { role: 'user', content: 'Grade this answer' } });
    node.setRuntime({ complete } as ModelCompletionRuntime);
    node.properties.model_ref = {
      providerKey: 'openrouter',
      modelId: 'shared-model',
    };

    await node.onExecute();

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        modelRef: { providerKey: 'openrouter', modelId: 'shared-model' },
        parameters: expect.objectContaining({
          max_tokens: 64,
          temperature: 0.4,
        }),
      }),
    );
    expect(node.properties.value).toBe('hello');
  });

  it('records typed runtime warnings on the transient execution context', async () => {
    const warning: ModelExecutionWarning = {
      code: 'UNSUPPORTED_MODEL_PARAMETER',
      parameter: 'top_k',
      providerKey: 'openai',
      modelId: 'model-a',
    };
    const node = ready({ 0: { role: 'user', content: 'Grade this answer' } });
    node.setRuntime({
      complete: jest
        .fn()
        .mockResolvedValue({ text: 'done', warnings: [warning] }),
    });

    await node.onExecute();

    expect(node.executionWarnings).toEqual([warning]);
  });

  it('rejects unresolved selections before invoking a provider', async () => {
    const complete = jest.fn();
    const node = new LLMNode();
    node.setRuntime({ complete });

    await expect(node.onExecute()).rejects.toThrow(
      'Select an available provider',
    );
    expect(complete).not.toHaveBeenCalled();
  });
});

/** SPEC-0019: the node builds the message list from whatever the ports deliver. */
describe('LLMNode prompt normalisation', () => {
  const runWith = async (
    values: Record<number, unknown>,
  ): Promise<{ node: LLMNode; complete: jest.Mock }> => {
    const complete = jest.fn().mockResolvedValue({ text: 'ok', warnings: [] });
    const node = ready(values);
    node.setRuntime({ complete } as ModelCompletionRuntime);
    await node.onExecute();
    return { node, complete };
  };

  const sentMessages = (complete: jest.Mock): unknown =>
    (complete.mock.calls[0][0] as { messages: unknown }).messages;

  it('wraps a bare string as a user message (FR-002)', async () => {
    const { complete } = await runWith({ 0: 'Grade this answer' });

    expect(sentMessages(complete)).toEqual([
      { role: 'user', content: 'Grade this answer' },
    ]);
  });

  it('wraps every element of a string array in order (FR-003)', async () => {
    const { complete } = await runWith({ 1: ['first', 'second'] });

    expect(sentMessages(complete)).toEqual([
      { role: 'user', content: 'first' },
      { role: 'user', content: 'second' },
    ]);
  });

  it('passes message objects through unchanged beside derived ones (FR-003)', async () => {
    const system = { role: 'system', content: 'You grade answers' };
    const { complete } = await runWith({ 1: [system, 'Grade this answer'] });

    const messages = sentMessages(complete) as unknown[];
    expect(messages).toEqual([
      system,
      { role: 'user', content: 'Grade this answer' },
    ]);
    expect(messages[0]).toBe(system);
  });

  it('keeps a single message on the singular port identical (FR-005)', async () => {
    const message = { role: 'user', content: 'Stored graph prompt' };
    const { complete } = await runWith({ 0: message });

    expect(sentMessages(complete)).toEqual([message]);
  });

  it('composes a role-carrying message with a plain string across ports (US-002)', async () => {
    const system = { role: 'system', content: 'You grade answers' };
    const { complete } = await runWith({ 0: system, 1: 'Grade this answer' });

    expect(sentMessages(complete)).toEqual([
      system,
      { role: 'user', content: 'Grade this answer' },
    ]);
  });

  it('records the normalised list in the run trace (FR-007)', async () => {
    const { node } = await runWith({ 0: 'Grade this answer' });

    expect(node.executionDetails).toEqual([
      expect.objectContaining({
        name: 'Prompt sent',
        value: [{ role: 'user', content: 'Grade this answer' }],
      }),
    ]);
  });

  it('never mutates a value shared by two model nodes', async () => {
    const shared = 'Grade this answer';
    const first = await runWith({ 0: shared });
    const second = await runWith({ 0: shared });

    expect(sentMessages(first.complete)).toEqual(
      sentMessages(second.complete),
    );
    expect(shared).toBe('Grade this answer');
  });
});

/** SPEC-0019/FR-006: a prompt that says nothing fails against its node. */
describe('LLMNode prompt rejection', () => {
  const failWith = async (
    values: Record<number, unknown>,
  ): Promise<{ error: Error; complete: jest.Mock }> => {
    const complete = jest.fn();
    const node = ready(values);
    node.title = 'Assessment model';
    node.setRuntime({ complete } as ModelCompletionRuntime);
    const error = await node.onExecute().then(
      () => {
        throw new Error('expected onExecute to reject');
      },
      (cause: Error) => cause,
    );
    return { error, complete };
  };

  it.each([
    ['whitespace only', { 0: '   ' }],
    ['no message at all', {}],
    ['a message with empty content', { 0: { role: 'user', content: '' } }],
    ['a message with no content', { 0: { role: 'user' } }],
  ])('names the node when it receives %s', async (_label, values) => {
    const { error, complete } = await failWith(values);

    expect(error.message).toContain('Assessment model');
    expect(complete).not.toHaveBeenCalled();
  });

  it.each([
    ['a number', { 0: 42 }],
    ['null', { 0: null }],
    ['a boolean', { 1: true }],
    ['a nested array', { 1: [['nested']] }],
  ])('reports %s against the node and its port', async (_label, values) => {
    const { error, complete } = await failWith(values);

    expect(error.message).toContain('Assessment model');
    expect(error.message).toMatch(/input "messages?"/);
    expect(complete).not.toHaveBeenCalled();
  });

  it('names the offending element of a concatenated list', async () => {
    const system = { role: 'system', content: 'You grade answers' };
    const { error } = await failWith({ 1: [system, undefined] });

    expect(error.message).toContain('at position 2');
  });
});
