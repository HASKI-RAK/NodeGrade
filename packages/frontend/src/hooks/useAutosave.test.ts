import '@haski/ta-lib'

import { act, renderHook } from '@testing-library/react'
import { LGraph, LiteGraph } from 'litegraph.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { jsonResponse, stubApi } from '@/test/apiStub'

import { useAutosave } from './useAutosave'

describe('useAutosave', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('turns read-only when the server says the workshop ended (SPEC-0022/FR-011)', async () => {
    stubApi(() =>
      jsonResponse(
        { statusCode: 403, code: 'workshop_closed', message: 'Ended' },
        { status: 403 }
      )
    )
    const graph = new LGraph()
    const onWorkshopClosed = vi.fn()
    const { result } = renderHook(() =>
      useAutosave({
        graph,
        workflowId: 'wf-1',
        token: 'tok',
        initialVersion: 1,
        enabled: true,
        onWorkshopClosed
      })
    )

    graph.add(LiteGraph.createNode('basic/const'))
    let outcome: string | undefined
    await act(async () => {
      outcome = await result.current.saveNow()
    })

    expect(outcome).toBe('readonly')
    expect(result.current.status).toBe('readonly')
    expect(onWorkshopClosed).toHaveBeenCalledTimes(1)
  })

  it('still reports other refusals as a failed save', async () => {
    stubApi(() => jsonResponse({ code: 'boom' }, { status: 500 }))
    const graph = new LGraph()
    const onWorkshopClosed = vi.fn()
    const { result } = renderHook(() =>
      useAutosave({
        graph,
        workflowId: 'wf-1',
        token: 'tok',
        initialVersion: 1,
        enabled: true,
        onWorkshopClosed
      })
    )

    graph.add(LiteGraph.createNode('basic/const'))
    await act(async () => {
      await result.current.saveNow()
    })

    expect(result.current.status).toBe('error')
    expect(onWorkshopClosed).not.toHaveBeenCalled()
  })
})
