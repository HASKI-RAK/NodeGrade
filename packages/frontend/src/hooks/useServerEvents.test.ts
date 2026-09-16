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

    act(() => result.current.beginAttempt())
    expect(result.current.attemptState).toBe('running')

    act(() =>
      emit('outputSet', {
        uniqueId: 'result',
        type: 'text',
        label: 'Result',
        value: 'Old'
      })
    )
    expect(result.current.outputs).toHaveProperty('result')

    act(() => result.current.beginAttempt())
    expect(result.current.outputs).toBeUndefined()

    act(() => emit('graphFinished', '{}'))
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
