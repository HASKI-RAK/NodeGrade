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
})
