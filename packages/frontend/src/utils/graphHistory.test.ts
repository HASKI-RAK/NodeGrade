import { LiteGraph } from '@haski/ta-lib'
import { describe, expect, it } from 'vitest'

import { GraphHistory } from './graphHistory'

describe('GraphHistory', () => {
  it('returns a stable state snapshot between mutations', () => {
    const graph = new LiteGraph.LGraph()
    const history = new GraphHistory(
      graph,
      () => [],
      () => undefined
    )

    expect(history.getState()).toBe(history.getState())
    history.transact(() => graph.add(LiteGraph.createNode('basic/number')))
    expect(history.getState()).toBe(history.getState())
  })

  it('undoes and redoes mutations in order', () => {
    const graph = new LiteGraph.LGraph()
    const history = new GraphHistory(
      graph,
      () => [],
      () => undefined
    )
    history.transact(() => graph.add(LiteGraph.createNode('basic/number')))
    history.transact(() => graph.add(LiteGraph.createNode('basic/textfield')))
    expect(graph.serialize().nodes).toHaveLength(2)

    history.undo()
    expect(graph.serialize().nodes).toHaveLength(1)
    history.undo()
    expect(graph.serialize().nodes).toHaveLength(0)
    history.redo()
    expect(graph.serialize().nodes).toHaveLength(1)
  })

  it('invalidates redo after a new mutation', () => {
    const graph = new LiteGraph.LGraph()
    const history = new GraphHistory(
      graph,
      () => [],
      () => undefined
    )
    history.transact(() => graph.add(LiteGraph.createNode('basic/number')))
    history.undo()
    expect(history.getState().canRedo).toBe(true)
    history.transact(() => graph.add(LiteGraph.createNode('input/question')))
    expect(history.getState().canRedo).toBe(false)
  })
})
