import { LGraph, LGraphNode } from '@haski/ta-lib';
import {
  executeLgraph,
  GraphExecutionError,
  NodeLifecycleEvent,
} from './Graph.js';

const node = (
  id: number,
  execute: (self: LGraphNode) => Promise<void> | void = () => undefined,
): LGraphNode => {
  const candidate = {
    id,
    title: `Node ${id}`,
    type: `test/${id}`,
    outputs: [{ name: 'value', type: 'string' }],
    getOutputData: jest.fn(() => `output-${id}`),
    onExecute: jest.fn(function (this: LGraphNode) {
      return execute(this);
    }),
  };
  return candidate as unknown as LGraphNode;
};

const graph = (nodes: LGraphNode[]): LGraph =>
  ({ computeExecutionOrder: jest.fn(() => nodes) }) as unknown as LGraph;

describe('executeLgraph lifecycle', () => {
  it('emits ordered states, timing, outputs, and progress', async () => {
    const nodes = [node(1), node(2)];
    const events: NodeLifecycleEvent[] = [];
    const progress: number[] = [];

    await executeLgraph(graph(nodes), (value) => progress.push(value), false, {
      onNodeEvent: (event) => events.push(event),
    });

    expect(
      events.map(({ node: current, state }) => `${current.id}:${state}`),
    ).toEqual([
      '1:queued',
      '2:queued',
      '1:running',
      '1:completed',
      '2:running',
      '2:completed',
    ]);
    expect(events[3].outputs?.[0]).toMatchObject({
      value: 'output-1',
      truncated: false,
    });
    expect(events[3].durationMs).toEqual(expect.any(Number));
    expect(progress).toEqual([0.5, 1]);
  });

  it('fails fast and marks remaining nodes skipped', async () => {
    const failing = node(1, () => {
      throw new Error('secret provider response');
    });
    const remaining = node(2);
    const events: NodeLifecycleEvent[] = [];

    await expect(
      executeLgraph(graph([failing, remaining]), undefined, false, {
        onNodeEvent: (event) => events.push(event),
      }),
    ).rejects.toBeInstanceOf(GraphExecutionError);

    expect(remaining.onExecute).toHaveBeenCalledTimes(0);
    expect(
      events
        .filter(({ state }) => ['failed', 'skipped'].includes(state))
        .map(({ state }) => state),
    ).toEqual(['failed', 'skipped']);
  });

  it('aborts a timed-out node and suppresses its late completion event', async () => {
    let receivedSignal: AbortSignal | undefined;
    const slow = node(1, async (self) => {
      receivedSignal = self.executionSignal;
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const events: NodeLifecycleEvent[] = [];

    await expect(
      executeLgraph(graph([slow]), undefined, false, {
        timeoutMs: 5,
        onNodeEvent: (event) => events.push(event),
      }),
    ).rejects.toMatchObject({ traceError: { code: 'timeout' } });
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(receivedSignal?.aborted).toBe(true);
    expect(events.some(({ state }) => state === 'completed')).toBe(false);
  });

  it('marks active and queued nodes cancelled', async () => {
    const controller = new AbortController();
    const active = node(1, async () => {
      controller.abort();
      await Promise.resolve();
    });
    const queued = node(2);
    const events: NodeLifecycleEvent[] = [];

    await expect(
      executeLgraph(graph([active, queued]), undefined, false, {
        signal: controller.signal,
        onNodeEvent: (event) => events.push(event),
      }),
    ).rejects.toMatchObject({ traceError: { code: 'cancelled' } });

    expect(events.filter(({ state }) => state === 'cancelled')).toHaveLength(2);
    expect(queued.onExecute).toHaveBeenCalledTimes(0);
  });

  it('keeps callback-free benchmark execution compatible', async () => {
    const candidate = node(1);
    await expect(executeLgraph(graph([candidate]))).resolves.toBeDefined();
    expect(candidate.onExecute).toHaveBeenCalledTimes(1);
  });
});
