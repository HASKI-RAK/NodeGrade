import {
  LLMNode,
  type ModelCompletionRuntime,
  type ModelExecutionWarning,
} from '@haski/ta-lib';

describe('LLMNode provider runtime', () => {
  it('executes the exact composite model reference through injected runtime', async () => {
    const complete = jest
      .fn()
      .mockResolvedValue({ text: 'hello', warnings: [] });
    const node = new LLMNode();
    node.setRuntime({ complete } as ModelCompletionRuntime);
    node.properties.model_ref = {
      providerKey: 'openrouter',
      modelId: 'shared-model',
    };
    node.properties.needs_model_selection = false;

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
    const node = new LLMNode();
    node.setRuntime({
      complete: jest
        .fn()
        .mockResolvedValue({ text: 'done', warnings: [warning] }),
    });
    node.properties.model_ref = { providerKey: 'openai', modelId: 'model-a' };
    node.properties.needs_model_selection = false;

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
