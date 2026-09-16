import {
  LGraph,
  LGraphNode,
  NodeExecutionState,
  TraceError,
  TraceOutput,
} from '@haski/ta-lib';

export type NodeLifecycleEvent = {
  node: LGraphNode;
  state: NodeExecutionState;
  timestamp: string;
  startedAt?: string;
  durationMs?: number;
  outputs?: TraceOutput[];
  error?: TraceError;
};

export type ExecuteLgraphOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  onNodeEvent?: (event: NodeLifecycleEvent) => void;
  mapOutputs?: (outputs: TraceOutput[]) => TraceOutput[];
};

export class GraphExecutionError extends Error {
  constructor(public readonly traceError: TraceError) {
    super(traceError.message);
    this.name = 'GraphExecutionError';
  }
}

const makeTraceError = (
  code: TraceError['code'],
  message: string,
): TraceError => ({
  code,
  message,
});

const captureOutputs = (node: LGraphNode): TraceOutput[] =>
  (node.outputs ?? []).map((output, slot) => ({
    slot,
    name: output.name ?? `Output ${slot + 1}`,
    type: String(output.type ?? '*'),
    value: node.getOutputData(slot),
    truncated: false,
  }));

const abortPromise = (signal: AbortSignal): Promise<never> =>
  new Promise((_, reject) => {
    const rejectAbort = () =>
      reject(
        new GraphExecutionError(makeTraceError('cancelled', 'Run cancelled.')),
      );
    if (signal.aborted) rejectAbort();
    else signal.addEventListener('abort', rejectAbort, { once: true });
  });

export async function executeLgraph(
  lgraph: LGraph,
  updateProgressCallback?: (progress: number) => void,
  onlyOnExecute = false,
  options: ExecuteLgraphOptions = {},
) {
  const execorder = lgraph.computeExecutionOrder<LGraphNode[]>(
    onlyOnExecute,
    true,
  );
  const timeoutMs = options.timeoutMs ?? 120_000;
  const emit = options.onNodeEvent;

  for (const node of execorder) {
    emit?.({ node, state: 'queued', timestamp: new Date().toISOString() });
  }

  if (options.signal?.aborted) {
    const error = makeTraceError('cancelled', 'Run cancelled.');
    for (const node of execorder) {
      emit?.({
        node,
        state: 'cancelled',
        timestamp: new Date().toISOString(),
        error,
      });
    }
    throw new GraphExecutionError(error);
  }

  for (const [index, node] of execorder.entries()) {
    if (options.signal?.aborted) {
      const error = makeTraceError('cancelled', 'Run cancelled.');
      for (const remaining of execorder.slice(index)) {
        emit?.({
          node: remaining,
          state: 'cancelled',
          timestamp: new Date().toISOString(),
          error,
        });
      }
      throw new GraphExecutionError(error);
    }

    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    const nodeController = new AbortController();
    const forwardAbort = () => nodeController.abort();
    options.signal?.addEventListener('abort', forwardAbort, { once: true });
    node.executionSignal = nodeController.signal;
    emit?.({ node, state: 'running', timestamp: startedAt, startedAt });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(
          new GraphExecutionError(
            makeTraceError('timeout', `Node exceeded ${timeoutMs} ms timeout.`),
          ),
        );
        nodeController.abort();
      }, timeoutMs);
    });

    try {
      const contenders: Promise<unknown>[] = [
        Promise.resolve(node.onExecute?.()),
        timeoutPromise,
      ];
      contenders.push(abortPromise(nodeController.signal));
      await Promise.race(contenders);
      if (options.signal?.aborted) {
        throw new GraphExecutionError(
          makeTraceError('cancelled', 'Run cancelled.'),
        );
      }
      const rawOutputs = captureOutputs(node);
      const outputs = options.mapOutputs?.(rawOutputs) ?? rawOutputs;
      emit?.({
        node,
        state: 'completed',
        timestamp: new Date().toISOString(),
        startedAt,
        durationMs: Date.now() - started,
        outputs,
      });
      updateProgressCallback?.((index + 1) / execorder.length);
    } catch (cause: unknown) {
      const error =
        cause instanceof GraphExecutionError
          ? cause.traceError
          : makeTraceError('node_failed', 'Node execution failed.');
      const state = error.code === 'cancelled' ? 'cancelled' : 'failed';
      emit?.({
        node,
        state,
        timestamp: new Date().toISOString(),
        startedAt,
        durationMs: Date.now() - started,
        error,
      });
      for (const remaining of execorder.slice(index + 1)) {
        emit?.({
          node: remaining,
          state: state === 'cancelled' ? 'cancelled' : 'skipped',
          timestamp: new Date().toISOString(),
          error,
        });
      }
      throw new GraphExecutionError(error);
    } finally {
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener('abort', forwardAbort);
      node.executionSignal = undefined;
    }
  }
  return lgraph;
}
