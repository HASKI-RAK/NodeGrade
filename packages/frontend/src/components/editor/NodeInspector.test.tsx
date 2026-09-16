import { LiteGraph } from '@haski/ta-lib'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { GraphHistory } from '@/utils/graphHistory'

import { NodeInspector } from './NodeInspector'

describe('NodeInspector', () => {
  it('shows dedicated empty and multi-selection states', () => {
    const graph = new LiteGraph.LGraph()
    const history = new GraphHistory(
      graph,
      () => [],
      () => undefined
    )
    const { rerender } = render(<NodeInspector selection={[]} history={history} />)
    expect(screen.getByText(/Select one node/i)).toBeVisible()
    rerender(
      <NodeInspector
        selection={[
          LiteGraph.createNode('basic/number'),
          LiteGraph.createNode('input/question')
        ]}
        history={history}
      />
    )
    expect(screen.getByText(/Multiple nodes selected/i)).toBeVisible()
  })

  it('edits properties through setProperty and keeps advanced controls collapsed', async () => {
    const graph = new LiteGraph.LGraph()
    const history = new GraphHistory(
      graph,
      () => [],
      () => undefined
    )
    const number = LiteGraph.createNode('basic/number')
    const setProperty = number.setProperty.bind(number)
    let calls = 0
    number.setProperty = (name, value) => {
      calls += 1
      setProperty(name, value)
    }
    const { rerender } = render(<NodeInspector selection={[number]} history={history} />)
    fireEvent.change(screen.getByLabelText('Number'), { target: { value: '7' } })
    expect(number.properties.value).toBe(7)
    expect(calls).toBe(1)

    const llm = LiteGraph.createNode('models/llm')
    rerender(<NodeInspector selection={[llm]} history={history} />)
    expect(screen.getByLabelText('Maximum tokens')).not.toBeVisible()
    await userEvent.click(screen.getByText('Advanced'))
    expect(screen.getByLabelText('Maximum tokens')).toBeVisible()
  })
})
