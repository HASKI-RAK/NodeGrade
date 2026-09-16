import { LiteGraph } from '@haski/ta-lib'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { NodePalette } from './NodePalette'

describe('NodePalette', () => {
  it('groups, searches, and inserts a node in one mutation', async () => {
    const graph = new LiteGraph.LGraph()
    const mutate = vi.fn((mutation: () => void) => mutation())
    const user = userEvent.setup()
    render(
      <NodePalette
        graph={graph}
        canvas={null}
        blocks={[]}
        onMutate={mutate}
        onAddNode={() => undefined}
        onAddBlock={() => undefined}
      />
    )

    expect(screen.getByText('Essential')).toBeVisible()
    await user.type(screen.getByLabelText('Search nodes'), 'basic/number')
    await user.click(screen.getByRole('button', { name: /provide a number/i }))

    expect(mutate).toHaveBeenCalledOnce()
    expect(graph.serialize().nodes).toHaveLength(1)
    expect(graph.serialize().nodes[0].type).toBe('basic/number')
  })
})
