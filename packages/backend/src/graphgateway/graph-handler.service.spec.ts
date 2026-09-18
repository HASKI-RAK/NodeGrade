import { LGraph } from '@haski/ta-lib';
import { Socket } from 'socket.io';
import { XapiService } from '../xapi.service.js';
import { WorkflowService } from '../workflow/workflow.service.js';
import {
  DEFAULT_EXECUTION_LIMITS,
  ExecutionLimitsService,
} from '../provider/execution-limits.service.js';
import { ProviderRuntimeService } from '../provider/provider-runtime.service.js';
import { GraphHandlerService } from './graph-handler.service.js';

const client = (id: string, workspaceId: string) =>
  ({
    id,
    data: { workspace: { id: workspaceId } },
    handshake: { auth: {} },
    emit: jest.fn(),
  }) as unknown as Socket;

const payload = (requestId: string) => ({
  requestId,
  workflowId: 'workflow-1',
  answer: 'A sufficiently long answer',
  graph: JSON.stringify(new LGraph().serialize()),
});

const service = (
  workspaceConcurrentRuns = DEFAULT_EXECUTION_LIMITS.workspaceConcurrentRuns,
) =>
  new GraphHandlerService(
    {
      getExecutionContent: jest
        .fn()
        .mockResolvedValue(JSON.stringify(new LGraph().serialize())),
    } as unknown as WorkflowService,
    {} as XapiService,
    {} as ProviderRuntimeService,
    {
      get: jest.fn().mockResolvedValue({
        ...DEFAULT_EXECUTION_LIMITS,
        workspaceConcurrentRuns,
      }),
    } as unknown as ExecutionLimitsService,
  );

describe('GraphHandlerService run ownership', () => {
  it('creates unique run ids, correlates events, and cleans terminal runs', async () => {
    const handler = service();
    const socket = client('client-1', 'workspace-1');

    await handler.handleRunGraph(socket, payload('request-1'));
    await handler.handleRunGraph(socket, payload('request-2'));

    const emitted = jest.mocked(socket.emit).mock.calls;
    const queued = emitted
      .filter(([eventName]) => eventName === 'runStateChanged')
      .map(([, eventPayload]) => eventPayload)
      .filter((eventPayload) => eventPayload.state === 'queued');
    expect(queued).toHaveLength(2);
    expect(queued[0]).toMatchObject({
      requestId: 'request-1',
      workflowId: 'workflow-1',
    });
    expect(queued[0].runId).not.toBe(queued[1].runId);

    const activeRuns = Reflect.get(handler, 'activeRuns') as Map<
      unknown,
      unknown
    >;
    expect(activeRuns.size).toBe(0);
  });

  it('rejects a run once the workspace is at its concurrency limit', async () => {
    const handler = service(1);
    const socket = client('client-1', 'workspace-1');
    const activeRuns = Reflect.get(handler, 'activeRuns') as Map<
      string,
      object
    >;
    activeRuns.set('run-1', {
      runId: 'run-1',
      requestId: 'request-0',
      clientId: 'client-1',
      workspaceId: 'workspace-1',
      workflowId: 'workflow-1',
      controller: new AbortController(),
    });

    await handler.handleRunGraph(socket, payload('request-1'));

    const emitted = jest.mocked(socket.emit).mock.calls;
    expect(
      emitted
        .filter(([eventName]) => eventName === 'runStateChanged')
        .map(([, eventPayload]) => eventPayload),
    ).toEqual([
      expect.objectContaining({
        requestId: 'request-1',
        state: 'failed',
        error: expect.objectContaining({ code: 'rate_limited' }),
      }),
    ]);
    expect(
      emitted
        .filter(([eventName]) => eventName === 'graphOperationFailed')
        .map(([, eventPayload]) => eventPayload),
    ).toEqual([
      expect.objectContaining({
        operation: 'run',
        code: 'rate-limited',
        retryable: true,
      }),
    ]);
    // The refused attempt must not occupy a slot of its own.
    expect(activeRuns.size).toBe(1);
  });

  it('runs concurrently up to the workspace limit', async () => {
    const handler = service(2);
    const socket = client('client-1', 'workspace-1');

    await Promise.all([
      handler.handleRunGraph(socket, payload('request-1')),
      handler.handleRunGraph(socket, payload('request-2')),
    ]);

    const states = jest
      .mocked(socket.emit)
      .mock.calls.filter(([eventName]) => eventName === 'runStateChanged')
      .map(([, eventPayload]) => eventPayload.state);
    expect(states).not.toContain('failed');
  });

  it('validates socket, workspace, and workflow before cancellation', () => {
    const handler = service();
    const controller = new AbortController();
    const activeRuns = Reflect.get(handler, 'activeRuns') as Map<
      string,
      object
    >;
    activeRuns.set('run-1', {
      runId: 'run-1',
      requestId: 'request-1',
      clientId: 'client-1',
      workspaceId: 'workspace-1',
      workflowId: 'workflow-1',
      controller,
    });

    handler.cancelRun(client('client-2', 'workspace-1'), {
      runId: 'run-1',
      workflowId: 'workflow-1',
    });
    handler.cancelRun(client('client-1', 'workspace-2'), {
      runId: 'run-1',
      workflowId: 'workflow-1',
    });
    handler.cancelRun(client('client-1', 'workspace-1'), {
      runId: 'run-1',
      workflowId: 'workflow-2',
    });
    expect(controller.signal.aborted).toBe(false);

    const owner = client('client-1', 'workspace-1');
    handler.cancelRun(owner, { runId: 'run-1', workflowId: 'workflow-1' });
    handler.cancelRun(owner, { runId: 'run-1', workflowId: 'workflow-1' });
    expect(controller.signal.aborted).toBe(true);
  });

  it('aborts every active run for a disconnected client', () => {
    const handler = service();
    const owned = new AbortController();
    const other = new AbortController();
    const activeRuns = Reflect.get(handler, 'activeRuns') as Map<
      string,
      object
    >;
    activeRuns.set('owned', { clientId: 'client-1', controller: owned });
    activeRuns.set('other', { clientId: 'client-2', controller: other });

    handler.cancelRunsForClient('client-1');

    expect(owned.signal.aborted).toBe(true);
    expect(other.signal.aborted).toBe(false);
  });

  it('compiles subgraph wrappers before execution and labels traces by block', async () => {
    const handler = service();
    const socket = client('client-1', 'workspace-1');
    const graph = {
      nodes: [
        {
          id: 1,
          type: 'graph/subgraph',
          pos: [0, 0],
          title: 'Feedback Generator',
          properties: { templateBoundary: [] },
          subgraph: {
            nodes: [
              {
                id: 1,
                type: 'basic/watch',
                pos: [0, 0],
                inputs: [{ name: 'value', type: '*', link: null }],
                outputs: [],
                title: 'Inner watch',
              },
            ],
            links: [],
            groups: [],
            config: {},
            extra: {},
            version: 0.4,
          },
        },
      ],
      links: [],
      groups: [],
      config: {},
      extra: {},
      version: 0.4,
    };

    await handler.handleRunGraph(socket, {
      requestId: 'request-block',
      workflowId: 'workflow-1',
      answer: 'An answer long enough to run',
      graph: JSON.stringify(graph),
    });

    const traces = jest
      .mocked(socket.emit)
      .mock.calls.filter(([eventName]) => eventName === 'nodeExecutionChanged')
      .map(([, eventPayload]) => eventPayload);
    expect(traces.length).toBeGreaterThan(0);
    expect(traces[0]).toMatchObject({
      nodeTitle: 'Feedback Generator / Inner watch',
      wrapperId: 1,
      sourceId: 1,
      wrapperPath: ['Feedback Generator'],
    });
  });

  it('reports an uncompilable block as a failed run with the block path', async () => {
    const handler = service();
    const socket = client('client-1', 'workspace-1');
    const graph = {
      nodes: [
        {
          id: 1,
          type: 'graph/subgraph',
          pos: [0, 0],
          title: 'Feedback Generator',
          properties: { templateBoundary: [] },
          subgraph: {
            nodes: [{ id: 1, type: 'input/telepathy', pos: [0, 0] }],
            links: [],
            groups: [],
            config: {},
            extra: {},
            version: 0.4,
          },
        },
      ],
      links: [],
      groups: [],
      config: {},
      extra: {},
      version: 0.4,
    };

    await handler.handleRunGraph(socket, {
      requestId: 'request-bad-block',
      workflowId: 'workflow-1',
      answer: 'An answer long enough to run',
      graph: JSON.stringify(graph),
    });

    const states = jest
      .mocked(socket.emit)
      .mock.calls.filter(([eventName]) => eventName === 'runStateChanged')
      .map(([, eventPayload]) => eventPayload);
    expect(states.map((state) => state.state)).toContain('failed');
    const failure = jest
      .mocked(socket.emit)
      .mock.calls.filter(([eventName]) => eventName === 'graphOperationFailed')
      .map(([, eventPayload]) => eventPayload)[0];
    expect(failure.message).toContain('Feedback Generator');
  });

  it('resolves outputSet to the editor node that produced it, inside and outside blocks', async () => {
    const handler = service();
    const socket = client('client-1', 'workspace-1');
    // Editor ids deliberately differ from the sequential execution ids the compiler
    // assigns (top-level output is editor node 42 but executes as node 1).
    const graph = {
      nodes: [
        {
          id: 42,
          type: 'output/output',
          pos: [0, 0],
          title: 'Feedback output',
          properties: {
            uniqueId: '42',
            type: 'text',
            label: 'Feedback',
            value: 'unchanged',
          },
        },
        {
          id: 7,
          type: 'graph/subgraph',
          pos: [0, 0],
          title: 'Scoring',
          properties: { templateBoundary: [] },
          subgraph: {
            nodes: [
              {
                id: 3,
                type: 'output/output',
                pos: [0, 0],
                title: 'Score output',
                properties: {
                  uniqueId: '3',
                  type: 'score',
                  label: 'Score',
                  value: 0,
                },
              },
            ],
            links: [],
            groups: [],
            config: {},
            extra: {},
            version: 0.4,
          },
        },
      ],
      links: [],
      groups: [],
      config: {},
      extra: {},
      version: 0.4,
    };

    await handler.handleRunGraph(socket, {
      requestId: 'request-outputs',
      workflowId: 'workflow-1',
      answer: 'An answer long enough to run',
      graph: JSON.stringify(graph),
    });

    const outputs = jest
      .mocked(socket.emit)
      .mock.calls.filter(([eventName]) => eventName === 'outputSet')
      .map(([, eventPayload]) => eventPayload);
    expect(outputs).toHaveLength(2);
    expect(outputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Feedback',
          wrapperId: null,
          sourceId: 42,
          workflowId: 'workflow-1',
        }),
        expect.objectContaining({
          label: 'Score',
          wrapperId: 7,
          sourceId: 3,
          workflowId: 'workflow-1',
        }),
      ]),
    );
    // Only run correlation travels with the output, not the internal run record.
    expect(outputs[0]).not.toHaveProperty('controller');
    expect(outputs[0]).not.toHaveProperty('clientId');
  });
});
