import { LGraph } from '@haski/ta-lib'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useWorkflowForm } from './useWorkflowForm'

const graphWith = (nodes: unknown[]) => {
  const graph = new LGraph()
  graph.configure({
    last_node_id: nodes.length,
    last_link_id: 0,
    nodes,
    links: [],
    groups: [],
    config: {},
    version: 0.4
    // The serialized shape LiteGraph accepts is wider than its published type.
  } as never)
  return graph
}

const question = {
  id: 1,
  type: 'input/question',
  pos: [0, 0],
  size: [200, 100],
  flags: {},
  order: 0,
  mode: 0,
  outputs: [{ name: 'string', type: 'string', links: [] }],
  properties: { precision: 1, value: 'Explain photosynthesis.' }
}

const answer = (minChars: number, maxChars: number) => ({
  id: 2,
  type: 'input/answer',
  pos: [0, 200],
  size: [200, 60],
  flags: {},
  order: 1,
  mode: 0,
  outputs: [{ name: 'string', type: 'string', links: [] }],
  properties: { value: '', minChars, maxChars }
})

describe('useWorkflowForm', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('reads the question and answer bounds out of the open graph', () => {
    const graph = graphWith([question, answer(20, 1500)])

    const { result } = renderHook(() => useWorkflowForm(graph, true))

    expect(result.current).toEqual({
      question: 'Explain photosynthesis.',
      constraints: { minChars: 20, maxChars: 1500 }
    })
  })

  it('follows an inspector edit of the question node (AC-003)', () => {
    const graph = graphWith([question, answer(20, 1500)])
    const { result } = renderHook(() => useWorkflowForm(graph, true))

    act(() => {
      graph.getNodeById(1)!.properties.value = 'Explain cellular respiration.'
      vi.advanceTimersByTime(500)
    })

    expect(result.current.question).toBe('Explain cellular respiration.')
  })

  it('reports no bounds when the workflow declares none (FR-008)', () => {
    const graph = graphWith([question, answer(0, 0)])

    const { result } = renderHook(() => useWorkflowForm(graph, true))

    expect(result.current.constraints).toEqual({})
  })

  it('stops reading the graph while the preview is closed', () => {
    const graph = graphWith([question, answer(20, 1500)])
    const serialize = vi.spyOn(graph, 'serialize')

    const { result } = renderHook(() => useWorkflowForm(graph, false))
    act(() => vi.advanceTimersByTime(2000))

    expect(serialize).not.toHaveBeenCalled()
    expect(result.current).toEqual({ question: '', constraints: {} })
  })
})
