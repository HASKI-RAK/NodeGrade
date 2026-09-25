import { LGraph, LLMNode } from '@haski/ta-lib';
import { Socket } from 'socket.io';
import { XapiService } from '../xapi.service.js';
import { WorkflowService } from '../workflow/workflow.service.js';
import {
  DEFAULT_EXECUTION_LIMITS,
  ExecutionLimitsService,
} from '../provider/execution-limits.service.js';
import { ProviderRuntimeService } from '../provider/provider-runtime.service.js';
import type { RunService } from '../run/run.service.js';
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

const runRecords = () => ({ record: jest.fn().mockResolvedValue(undefined) });

const service = (
  workspaceConcurrentRuns = DEFAULT_EXECUTION_LIMITS.workspaceConcurrentRuns,
  runs = runRecords(),
  workflows: Partial<WorkflowService> = {
    getExecutionContent: jest
      .fn()
      .mockResolvedValue(JSON.stringify(new LGraph().serialize())),
  },
) =>
  new GraphHandlerService(
    workflows as unknown as WorkflowService,
    {} as XapiService,
    {
      defaultModel: jest.fn().mockResolvedValue(null),
    } as unknown as ProviderRuntimeService,
    {
      get: jest.fn().mockResolvedValue({
        ...DEFAULT_EXECUTION_LIMITS,
        workspaceConcurrentRuns,
      }),
    } as unknown as ExecutionLimitsService,
    runs as unknown as RunService,
  );

describe('GraphHandlerService default model substitution', () => {
  const fallback = { providerKey: 'openai', modelId: 'gpt-5' };
  const handlerWith = (defaultModel: jest.Mock) =>
    new GraphHandlerService(
      {
        getExecutionContent: jest.fn(),
      } as unknown as WorkflowService,
      {} as XapiService,
      { defaultModel } as unknown as ProviderRuntimeService,
      {
        get: jest.fn().mockResolvedValue(DEFAULT_EXECUTION_LIMITS),
      } as unknown as ExecutionLimitsService,
      runRecords() as unknown as RunService,
    );
  const llmGraph = (
    properties: Record<string, unknown>,
  ): InstanceType<typeof LGraph> => {
    const graph = new LGraph();
    graph.configure({
      nodes: [
        {
          id: 1,
          type: 'models/llm',
          pos: [0, 0],
          properties: {
            value: '',
            model: '',
            model_ref: null,
            needs_model_selection: true,
            ...properties,
          },
        },
      ],
      links: [],
      groups: [],
      config: {},
      extra: {},
      version: 0.4,
    });
    return graph;
  };
  const applyDefault = (
    handler: GraphHandlerService,
    graph: InstanceType<typeof LGraph>,
  ): Promise<void> =>
    (
      handler as unknown as {
        applyDefaultModel: (
          lgraph: InstanceType<typeof LGraph>,
        ) => Promise<void>;
      }
    ).applyDefaultModel(graph);

  it('fills model nodes without a selection from the deployment default', async () => {
    const handler = handlerWith(jest.fn().mockResolvedValue(fallback));
    const graph = llmGraph({});

    await applyDefault(handler, graph);

    const node = graph.findNodesByClass(LLMNode)[0];
    expect(node.properties.model_ref).toEqual(fallback);
    expect(node.properties.model).toBe('gpt-5');
    expect(node.properties.needs_model_selection).toBe(false);
  });

  it('leaves explicitly configured nodes and stored content alone', async () => {
    const configured = {
      model_ref: { providerKey: 'openai', modelId: 'other' },
      needs_model_selection: false,
    };
    const handler = handlerWith(jest.fn().mockResolvedValue(fallback));
    const graph = llmGraph(configured);

    await applyDefault(handler, graph);

    const node = graph.findNodesByClass(LLMNode)[0];
    expect(node.properties.model_ref).toEqual(configured.model_ref);
    expect(node.properties.needs_model_selection).toBe(false);
  });

  it('leaves unconfigured nodes failing when no default is set', async () => {
    const handler = handlerWith(jest.fn().mockResolvedValue(null));
    const graph = llmGraph({});

    await applyDefault(handler, graph);

    const node = graph.findNodesByClass(LLMNode)[0];
    expect(node.properties.model_ref).toBeNull();
    expect(node.properties.needs_model_selection).toBe(true);
  });
});

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

describe('GraphHandlerService run records (SPEC-0020/FR-004)', () => {
  // An answer input echoed to a plain output, and a text field feeding a review
  // flag: the smallest graph that yields a flagged review output without a model.
  const REVIEWER_REPLY = 'RECOMMENDATION: EDUCATOR_REVIEW\nREASON: Contradictory claims.';
  const flaggedGraph = {
    nodes: [
      {
        id: 9,
        type: 'input/answer',
        pos: [0, 0],
        outputs: [{ name: 'string', type: 'string', links: [2] }],
        properties: { value: '' },
      },
      {
        id: 10,
        type: 'basic/textfield',
        pos: [0, 0],
        title: 'Reviewer reply',
        outputs: [{ name: 'string', type: 'string', links: [1] }],
        properties: { value: REVIEWER_REPLY },
      },
      {
        id: 11,
        type: 'output/review-flag',
        pos: [0, 0],
        title: 'Needs a tutor? flag',
        inputs: [{ name: 'signal', type: 'string,boolean', link: 1 }],
        outputs: [{ name: 'flagged', type: 'boolean', links: [] }],
        properties: {
          label: 'Needs a tutor?',
          flagPattern: 'EDUCATOR_REVIEW',
          reasonPrefix: 'REASON:',
          value: '',
        },
      },
      {
        id: 12,
        type: 'output/output',
        pos: [0, 0],
        title: 'Feedback output',
        inputs: [{ name: '*', type: '*', link: 2 }],
        properties: { uniqueId: '12', type: 'text', label: 'Feedback', value: '' },
      },
    ],
    links: [
      [1, 10, 0, 11, 0, 'string'],
      [2, 9, 0, 12, 0, 'string'],
    ],
    groups: [],
    config: {},
    extra: {},
    version: 0.4,
  };

  const stateCalls = (socket: Socket) =>
    jest
      .mocked(socket.emit)
      .mock.calls.map(([eventName, eventPayload], index) => ({
        eventName,
        eventPayload,
        order: jest.mocked(socket.emit).mock.invocationCallOrder[index],
      }))
      .filter((call) => call.eventName === 'runStateChanged');

  it('records a completed run with its answer and flagged outputs before the terminal event', async () => {
    const runs = runRecords();
    const handler = service(undefined, runs);
    const socket = client('client-1', 'workspace-1');

    const answer = 'One quarter is bigger because four is more than two.';
    await handler.handleRunGraph(socket, {
      requestId: 'request-record',
      workflowId: 'workflow-1',
      answer,
      graph: JSON.stringify(flaggedGraph),
    });

    const states = stateCalls(socket);
    const completed = states.find((call) => call.eventPayload.state === 'completed');
    expect(completed).toBeDefined();
    expect(runs.record).toHaveBeenCalledTimes(1);
    expect(runs.record.mock.invocationCallOrder[0]).toBeLessThan(completed!.order);
    expect(runs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: completed!.eventPayload.runId,
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
        outcome: 'COMPLETED',
        answer,
        submittedBy: undefined,
        startedAt: expect.any(Date),
        finishedAt: expect.any(Date),
        outputs: expect.arrayContaining([
          expect.objectContaining({
            type: 'review',
            verdict: 'flagged',
            label: 'Needs a tutor?',
            value: 'Contradictory claims.',
            wrapperId: null,
            sourceId: 11,
          }),
          expect.objectContaining({
            type: 'text',
            label: 'Feedback',
            value: answer,
            sourceId: 12,
          }),
        ]),
      }),
    );
  });

  it('keeps the LTI launch name on the record', async () => {
    const runs = runRecords();
    const handler = service(undefined, runs);
    const socket = client('client-1', 'workspace-1');
    (socket.handshake as { auth: Record<string, unknown> }).auth = {
      ltiCookie: { user_id: 'u-1', lis_person_name_full: 'Ada Lovelace' },
    };

    await handler.handleRunGraph(socket, {
      requestId: 'request-lti',
      workflowId: 'workflow-1',
      answer: 'An answer long enough to run',
      graph: JSON.stringify(flaggedGraph),
    });

    expect(runs.record).toHaveBeenCalledWith(
      expect.objectContaining({ submittedBy: 'Ada Lovelace' }),
    );
  });

  it('still completes the run when the record cannot be written', async () => {
    const runs = { record: jest.fn().mockRejectedValue(new Error('database away')) };
    const handler = service(undefined, runs);
    const socket = client('client-1', 'workspace-1');

    await handler.handleRunGraph(socket, {
      requestId: 'request-unrecorded',
      workflowId: 'workflow-1',
      answer: 'An answer long enough to run',
      graph: JSON.stringify(flaggedGraph),
    });

    expect(runs.record).toHaveBeenCalledTimes(1);
    expect(stateCalls(socket).map((call) => call.eventPayload.state)).toContain(
      'completed',
    );
  });

  it('records a run that fails during execution, never one that fails before it', async () => {
    const failing = {
      nodes: [
        {
          id: 1,
          type: 'models/llm',
          pos: [0, 0],
          properties: { value: '', model: '', model_ref: null, needs_model_selection: true },
        },
      ],
      links: [],
      groups: [],
      config: {},
      extra: {},
      version: 0.4,
    };
    const runs = runRecords();
    const handler = service(undefined, runs);
    const socket = client('client-1', 'workspace-1');

    await handler.handleRunGraph(socket, {
      requestId: 'request-failing',
      workflowId: 'workflow-1',
      answer: 'An answer long enough to run',
      graph: JSON.stringify(failing),
    });

    expect(stateCalls(socket).map((call) => call.eventPayload.state)).toContain('failed');
    expect(runs.record).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'FAILED', errorMessage: expect.any(String) }),
    );

    const rejected = runRecords();
    const unavailable = service(undefined, rejected, {
      getExecutionContent: jest.fn().mockRejectedValue(new Error('no such workflow')),
    });
    await unavailable.handleRunGraph(client('client-2', 'workspace-1'), {
      requestId: 'request-missing',
      workflowId: 'workflow-9',
      answer: 'An answer long enough to run',
    });
    expect(rejected.record).not.toHaveBeenCalled();
  });
});
