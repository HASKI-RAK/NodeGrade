import { LGraph } from '@haski/ta-lib';
import { Socket } from 'socket.io';
import { XapiService } from '../xapi.service.js';
import { WorkflowService } from '../workflow/workflow.service.js';
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

const service = () =>
  new GraphHandlerService(
    {
      getExecutionContent: jest
        .fn()
        .mockResolvedValue(JSON.stringify(new LGraph().serialize())),
    } as unknown as WorkflowService,
    {} as XapiService,
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
});
