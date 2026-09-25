import '@haski/ta-lib'

import { act, renderHook } from '@testing-library/react'
import { LGraph } from 'litegraph.js'
import { Socket } from 'socket.io-client'
import { describe, expect, it, vi } from 'vitest'

import { useServerEvents } from './useServerEvents'

type Listener = (payload: never) => void

function createSocket() {
  const listeners = new Map<string, Listener>()
  const socket = {
    on: vi.fn((eventName: string, handler: Listener) => {
      listeners.set(eventName, handler)
      return socket
    }),
    off: vi.fn((eventName: string, handler: Listener) => {
      if (listeners.get(eventName) === handler) listeners.delete(eventName)
      return socket
    })
  } as unknown as Socket

  return {
    socket,
    emit(eventName: string, payload: unknown) {
      listeners.get(eventName)?.(payload as never)
    }
  }
}

describe('useServerEvents', () => {
  it('tracks load, run, completion, and failure states', () => {
    const { socket, emit } = createSocket()
    const lgraph = new LGraph()
    const { result } = renderHook(() => useServerEvents({ socket, lgraph }))

    act(() => result.current.beginGraphLoad())
    expect(result.current.graphState).toBe('loading')

    act(() => result.current.beginAttempt('request-1'))
    expect(result.current.attemptState).toBe('running')

    act(() =>
      emit('runStateChanged', {
        requestId: 'request-1',
        runId: 'run-1',
        workflowId: 'workflow-1',
        state: 'queued',
        timestamp: '2026-09-16T00:00:00.000Z'
      })
    )

    act(() =>
      emit('outputSet', {
        runId: 'run-1',
        workflowId: 'workflow-1',
        timestamp: '2026-09-16T00:00:01.000Z',
        uniqueId: 'result',
        type: 'text',
        label: 'Result',
        value: 'Old'
      })
    )
    expect(result.current.outputs).toHaveProperty('result')

    act(() => result.current.beginAttempt('request-2'))
    expect(result.current.outputs).toBeUndefined()

    act(() =>
      emit('runStateChanged', {
        requestId: 'request-2',
        runId: 'run-2',
        workflowId: 'workflow-1',
        state: 'queued',
        timestamp: '2026-09-16T00:00:02.000Z'
      })
    )
    act(() =>
      emit('graphFinished', {
        runId: 'run-2',
        workflowId: 'workflow-1',
        timestamp: '2026-09-16T00:00:03.000Z',
        graph: '{}'
      })
    )
    expect(result.current.attemptState).toBe('completed')

    act(() => {
      emit('graphOperationFailed', {
        operation: 'load',
        code: 'not-found',
        message: 'Task not found',
        retryable: true
      })
    })
    expect(result.current.graphState).toBe('not-found')
    expect(result.current.failureMessage).toBe('Task not found')
  })

  it('binds request to run and filters interleaved trace events', () => {
    const { socket, emit } = createSocket()
    const { result } = renderHook(() => useServerEvents({ socket, lgraph: new LGraph() }))

    act(() => result.current.beginAttempt('request-current'))
    act(() =>
      emit('runStateChanged', {
        requestId: 'request-old',
        runId: 'run-old',
        workflowId: 'workflow-1',
        state: 'queued',
        timestamp: '2026-09-16T00:00:00.000Z'
      })
    )
    expect(result.current.runId).toBeUndefined()

    act(() =>
      emit('runStateChanged', {
        requestId: 'request-current',
        runId: 'run-current',
        workflowId: 'workflow-1',
        state: 'queued',
        timestamp: '2026-09-16T00:00:01.000Z'
      })
    )

    const step = {
      workflowId: 'workflow-1',
      nodeId: 1,
      nodeTitle: 'Answer Input',
      nodeType: 'input/answer',
      state: 'completed',
      timestamp: '2026-09-16T00:00:02.000Z'
    }
    act(() => emit('nodeExecutionChanged', { ...step, runId: 'run-old' }))
    act(() => emit('nodeExecutionChanged', { ...step, runId: 'run-current' }))

    expect(result.current.runId).toBe('run-current')
    expect(result.current.trace).toHaveLength(1)
    expect(result.current.trace[0].runId).toBe('run-current')
  })

  it('abandons a queued attempt on cancel but captures a late run id', () => {
    const { socket, emit } = createSocket()
    const { result } = renderHook(() => useServerEvents({ socket, lgraph: new LGraph() }))

    act(() => result.current.beginAttempt('request-1'))
    act(() => result.current.cancelAttempt('The run was cancelled.'))

    expect(result.current.attemptState).toBe('failed')
    expect(result.current.failureMessage).toBe('The run was cancelled.')
    expect(result.current.runState).toBe('cancelled')
    expect(result.current.snackbar.open).toBe(true)

    // The server accepts the queued request late: no UI resurrection, but the
    // run id is captured so the caller can free the workspace slot.
    act(() =>
      emit('runStateChanged', {
        requestId: 'request-1',
        runId: 'run-late',
        workflowId: 'workflow-1',
        state: 'queued',
        timestamp: '2026-09-16T00:00:01.000Z'
      })
    )
    expect(result.current.runId).toBeUndefined()
    expect(result.current.cancelledRunId).toBe('run-late')
    expect(result.current.failureMessage).toBe('The run was cancelled.')

    act(() =>
      emit('outputSet', {
        runId: 'run-late',
        workflowId: 'workflow-1',
        timestamp: '2026-09-16T00:00:02.000Z',
        uniqueId: 'result',
        type: 'text',
        label: 'Result',
        value: 'Late'
      })
    )
    expect(result.current.outputs).toBeUndefined()

    act(() => result.current.acknowledgeCancelledRun())
    expect(result.current.cancelledRunId).toBeUndefined()

    // A fresh attempt clears the cancelled state and works normally.
    act(() => result.current.beginAttempt('request-2'))
    act(() =>
      emit('runStateChanged', {
        requestId: 'request-2',
        runId: 'run-2',
        workflowId: 'workflow-1',
        state: 'queued',
        timestamp: '2026-09-16T00:00:03.000Z'
      })
    )
    expect(result.current.runId).toBe('run-2')
    expect(result.current.runState).toBe('queued')
  })

  it('removes the exact socket listeners on unmount', () => {
    const { socket } = createSocket()
    const { unmount } = renderHook(() =>
      useServerEvents({ socket, lgraph: new LGraph() })
    )

    unmount()

    expect(socket.off).toHaveBeenCalled()
    for (const [eventName, handler] of vi.mocked(socket.on).mock.calls) {
      expect(socket.off).toHaveBeenCalledWith(eventName, handler)
    }
  })

  it('highlights the editor node via sourceId, not the compiled execution id', () => {
    const { socket, emit } = createSocket()
    const lgraph = new LGraph()
    lgraph.configure({
      last_node_id: 14,
      last_link_id: 0,
      nodes: [
        {
          id: 10,
          type: 'utils/concat-string',
          pos: [0, 0],
          size: [240, 80],
          flags: {},
          order: 0,
          mode: 0,
          inputs: [
            { name: 'string', type: 'string', link: null },
            { name: 'string', type: 'string', link: null }
          ],
          outputs: [{ name: 'string', type: 'string', links: [] }],
          title: 'Task context 4/4',
          properties: {}
        },
        {
          id: 14,
          type: 'models/llm',
          pos: [300, 0],
          size: [320, 220],
          flags: {},
          order: 1,
          mode: 0,
          inputs: [
            { name: 'message', type: 'message', link: null },
            { name: 'messages', type: '*', link: null }
          ],
          outputs: [{ name: 'string', type: 'string', links: [] }],
          title: 'Assessment model',
          properties: {}
        }
      ],
      links: [],
      groups: [],
      config: {},
      version: 0.4
    } as never)
    const { result } = renderHook(() => useServerEvents({ socket, lgraph }))

    act(() => result.current.beginAttempt('request-highlight'))
    act(() =>
      emit('runStateChanged', {
        requestId: 'request-highlight',
        runId: 'run-highlight',
        workflowId: 'workflow-1',
        state: 'queued',
        timestamp: '2026-09-16T00:00:00.000Z'
      })
    )

    const concat = lgraph.getNodeById(10)
    const model = lgraph.getNodeById(14)
    expect(concat).toBeDefined()
    expect(model).toBeDefined()

    // The compiler renumbers nodes from 1, so the concat runs as execution id
    // 3 while its editor id stays 10. Painting nodeId 3 must not touch any
    // editor node; only sourceId 10 may turn green.
    act(() =>
      emit('nodeExecutionChanged', {
        runId: 'run-highlight',
        workflowId: 'workflow-1',
        nodeId: 3,
        nodeTitle: 'Task context 4/4',
        nodeType: 'utils/concat-string',
        state: 'running',
        timestamp: '2026-09-16T00:00:01.000Z',
        wrapperId: null,
        sourceId: 10,
        wrapperPath: []
      })
    )
    expect(concat?.color).toBe('#88FF00')
    expect(model?.color).not.toBe('#88FF00')

    act(() =>
      emit('nodeExecutionChanged', {
        runId: 'run-highlight',
        workflowId: 'workflow-1',
        nodeId: 3,
        nodeTitle: 'Task context 4/4',
        nodeType: 'utils/concat-string',
        state: 'completed',
        timestamp: '2026-09-16T00:00:02.000Z',
        wrapperId: null,
        sourceId: 10,
        wrapperPath: []
      })
    )
    expect(concat?.color).not.toBe('#88FF00')

    // The model runs as execution id 4 while a stale mapping would still point
    // at an unrelated editor node: only editor id 14 may turn green, and the
    // finished concat must stay cleared.
    act(() =>
      emit('nodeExecutionChanged', {
        runId: 'run-highlight',
        workflowId: 'workflow-1',
        nodeId: 4,
        nodeTitle: 'Assessment model',
        nodeType: 'models/llm',
        state: 'running',
        timestamp: '2026-09-16T00:00:03.000Z',
        wrapperId: null,
        sourceId: 14,
        wrapperPath: []
      })
    )
    expect(model?.color).toBe('#88FF00')
    expect(concat?.color).not.toBe('#88FF00')
  })

  it('keeps exactly one running highlight and clears it on completion', () => {
    const { socket, emit } = createSocket()
    const lgraph = new LGraph()
    lgraph.configure({
      last_node_id: 14,
      last_link_id: 0,
      nodes: [
        {
          id: 10,
          type: 'utils/concat-string',
          pos: [0, 0],
          size: [240, 80],
          flags: {},
          order: 0,
          mode: 0,
          inputs: [
            { name: 'string', type: 'string', link: null },
            { name: 'string', type: 'string', link: null }
          ],
          outputs: [{ name: 'string', type: 'string', links: [] }],
          title: 'Task context 4/4',
          properties: {}
        },
        {
          id: 14,
          type: 'models/llm',
          pos: [300, 0],
          size: [320, 220],
          flags: {},
          order: 1,
          mode: 0,
          inputs: [
            { name: 'message', type: 'message', link: null },
            { name: 'messages', type: '*', link: null }
          ],
          outputs: [{ name: 'string', type: 'string', links: [] }],
          title: 'Assessment model',
          properties: {}
        }
      ],
      links: [],
      groups: [],
      config: {},
      version: 0.4
    } as never)
    const { result } = renderHook(() => useServerEvents({ socket, lgraph }))

    act(() => result.current.beginAttempt('request-single'))
    act(() =>
      emit('runStateChanged', {
        requestId: 'request-single',
        runId: 'run-single',
        workflowId: 'workflow-1',
        state: 'queued',
        timestamp: '2026-09-16T00:00:00.000Z'
      })
    )
    const concat = lgraph.getNodeById(10)
    const model = lgraph.getNodeById(14)

    act(() =>
      emit('nodeExecutionChanged', {
        runId: 'run-single',
        workflowId: 'workflow-1',
        nodeId: 3,
        nodeTitle: 'Task context 4/4',
        nodeType: 'utils/concat-string',
        state: 'running',
        timestamp: '2026-09-16T00:00:01.000Z',
        wrapperId: null,
        sourceId: 10,
        wrapperPath: []
      })
    )
    // A second running event without an intermediate terminal event (e.g. a
    // lost completed payload) must move the highlight, never duplicate it.
    act(() =>
      emit('nodeExecutionChanged', {
        runId: 'run-single',
        workflowId: 'workflow-1',
        nodeId: 4,
        nodeTitle: 'Assessment model',
        nodeType: 'models/llm',
        state: 'running',
        timestamp: '2026-09-16T00:00:02.000Z',
        wrapperId: null,
        sourceId: 14,
        wrapperPath: []
      })
    )
    expect(model?.color).toBe('#88FF00')
    expect(concat?.color).not.toBe('#88FF00')

    act(() =>
      emit('nodeExecutionChanged', {
        runId: 'run-single',
        workflowId: 'workflow-1',
        nodeId: 4,
        nodeTitle: 'Assessment model',
        nodeType: 'models/llm',
        state: 'completed',
        timestamp: '2026-09-16T00:00:03.000Z',
        wrapperId: null,
        sourceId: 14,
        wrapperPath: []
      })
    )
    expect(model?.color).not.toBe('#88FF00')
    expect(concat?.color).not.toBe('#88FF00')
  })

  it('highlights the wrapper for block-internal nodes and clears on a new attempt', () => {
    const { socket, emit } = createSocket()
    const lgraph = new LGraph()
    lgraph.configure({
      last_node_id: 9,
      last_link_id: 0,
      nodes: [
        {
          id: 9,
          type: 'graph/subgraph',
          pos: [0, 0],
          size: [300, 100],
          flags: {},
          order: 0,
          mode: 0,
          inputs: [],
          outputs: [],
          title: 'Feedback Generator',
          properties: {},
          subgraph: {
            last_node_id: 3,
            last_link_id: 0,
            nodes: [
              {
                id: 2,
                type: 'models/llm',
                pos: [0, 0],
                size: [320, 220],
                flags: {},
                order: 0,
                mode: 0,
                inputs: [
                  { name: 'message', type: 'message', link: null },
                  { name: 'messages', type: '*', link: null }
                ],
                outputs: [{ name: 'string', type: 'string', links: [] }],
                title: 'Feedback model',
                properties: {}
              }
            ],
            links: [],
            groups: [],
            config: {},
            version: 0.4
          }
        }
      ],
      links: [],
      groups: [],
      config: {},
      version: 0.4
    } as never)
    const { result } = renderHook(() => useServerEvents({ socket, lgraph }))

    act(() => result.current.beginAttempt('request-block'))
    act(() =>
      emit('runStateChanged', {
        requestId: 'request-block',
        runId: 'run-block',
        workflowId: 'workflow-1',
        state: 'queued',
        timestamp: '2026-09-16T00:00:00.000Z'
      })
    )
    act(() =>
      emit('nodeExecutionChanged', {
        runId: 'run-block',
        workflowId: 'workflow-1',
        nodeId: 1,
        nodeTitle: 'Feedback Generator / Feedback model',
        nodeType: 'models/llm',
        state: 'running',
        timestamp: '2026-09-16T00:00:01.000Z',
        wrapperId: 9,
        sourceId: 2,
        wrapperPath: ['Feedback Generator']
      })
    )
    expect(lgraph.getNodeById(9)?.color).toBe('#88FF00')

    act(() => result.current.beginAttempt('request-next'))
    expect(lgraph.getNodeById(9)?.color).not.toBe('#88FF00')
  })

  it('reports a run refused because the workshop ended (SPEC-0022/FR-012)', () => {
    const { socket, emit } = createSocket()
    const lgraph = new LGraph()
    const { result } = renderHook(() => useServerEvents({ socket, lgraph }))

    act(() => result.current.beginAttempt('request-1'))
    act(() => {
      emit('runStateChanged', {
        requestId: 'request-1',
        runId: 'run-1',
        workflowId: 'wf-1',
        state: 'failed',
        timestamp: '2026-09-25T10:00:00.000Z',
        error: { code: 'workshop_closed', message: 'This workshop has ended.' }
      })
      emit('graphOperationFailed', {
        operation: 'run',
        code: 'workshop-closed',
        message: 'This workshop has ended.',
        retryable: false,
        runId: 'run-1',
        workflowId: 'wf-1',
        timestamp: '2026-09-25T10:00:00.000Z'
      })
    })

    expect(result.current.workshopClosed).toBe(true)
    expect(result.current.attemptState).toBe('failed')
  })
})
