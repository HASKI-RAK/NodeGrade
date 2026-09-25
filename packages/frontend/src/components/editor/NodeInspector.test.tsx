import { LiteGraph } from '@haski/ta-lib'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

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

  it('persists a composite model reference and clears migration state', async () => {
    const graph = new LiteGraph.LGraph()
    const history = new GraphHistory(
      graph,
      () => [],
      () => undefined
    )
    const llm = LiteGraph.createNode('models/llm')
    llm.properties.needs_model_selection = true
    render(
      <NodeInspector
        selection={[llm]}
        history={history}
        modelCatalog={[
          {
            ref: { providerKey: 'openrouter', modelId: 'shared-model' },
            label: 'Shared model',
            providerName: 'OpenRouter',
            capabilities: { supportedParameters: ['temperature'] }
          }
        ]}
      />
    )

    await userEvent.click(screen.getByLabelText('Model'))
    await userEvent.click(
      screen.getByRole('option', { name: 'Shared model · OpenRouter' })
    )

    expect(llm.properties.model_ref).toEqual({
      providerKey: 'openrouter',
      modelId: 'shared-model'
    })
    expect(llm.properties.model).toBe('shared-model')
    expect(llm.properties.needs_model_selection).toBe(false)
  })

  it('covers an unconfigured node with the deployment default instead of an error', () => {
    const graph = new LiteGraph.LGraph()
    const history = new GraphHistory(
      graph,
      () => [],
      () => undefined
    )
    const llm = LiteGraph.createNode('models/llm')
    llm.properties.needs_model_selection = true
    const { rerender } = render(
      <NodeInspector
        selection={[llm]}
        history={history}
        modelCatalog={[
          {
            ref: { providerKey: 'openrouter', modelId: 'shared-model' },
            label: 'Shared model',
            providerName: 'OpenRouter',
            capabilities: { supportedParameters: [] }
          }
        ]}
        defaultModel={{ providerKey: 'openrouter', modelId: 'shared-model' }}
      />
    )
    expect(
      screen.getByText(/Using default model: Shared model · OpenRouter/i)
    ).toBeVisible()
    expect(screen.queryByText(/Select a provider and model/i)).toBeNull()

    rerender(<NodeInspector selection={[llm]} history={history} modelCatalog={[]} />)
    expect(screen.getByText(/Select a provider and model/i)).toBeVisible()
  })

  it('shows unavailable references and disables unsupported parameters', async () => {
    const graph = new LiteGraph.LGraph()
    const history = new GraphHistory(
      graph,
      () => [],
      () => undefined
    )
    const llm = LiteGraph.createNode('models/llm')
    llm.properties.model_ref = { providerKey: 'openai', modelId: 'model-a' }
    llm.properties.needs_model_selection = false
    const { rerender } = render(
      <NodeInspector selection={[llm]} history={history} modelCatalog={[]} />
    )
    expect(screen.getByText(/Saved model is unavailable/i)).toBeVisible()

    rerender(
      <NodeInspector
        selection={[llm]}
        history={history}
        modelCatalog={[
          {
            ref: { providerKey: 'openai', modelId: 'model-a' },
            label: 'Model A',
            providerName: 'OpenAI',
            capabilities: { supportedParameters: ['temperature'] }
          }
        ]}
      />
    )
    await userEvent.click(screen.getByText('Advanced'))
    expect(screen.getByLabelText('Top K')).toBeDisabled()
  })

  it('shows block provenance and opens the nested graph', async () => {
    const graph = new LiteGraph.LGraph()
    const history = new GraphHistory(
      graph,
      () => [],
      () => undefined
    )
    const block = LiteGraph.createNode('graph/subgraph')
    block.title = 'Feedback generator'
    block.properties.templateBlock = {
      templateId: 'template-1',
      templateRevision: 3,
      templateName: 'Feedback generator',
      insertedAt: '2026-09-18T10:00:00.000Z'
    }
    block.properties.templateDescription = 'Generates formative feedback.'
    block.properties.templateBoundary = [
      {
        key: 'text',
        label: 'Text to review',
        dataType: 'string',
        direction: 'input',
        internalNodeId: 1,
        internalSlot: 0,
        required: true,
        description: 'Participant response.'
      }
    ]
    const onOpenBlock = vi.fn()

    render(
      <NodeInspector selection={[block]} history={history} onOpenBlock={onOpenBlock} />
    )
    expect(screen.getByText('Source template revision 3')).toBeVisible()
    expect(screen.getByText('Text to review · input · required')).toBeVisible()
    expect(screen.getByText('Participant response.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Open block' }))
    expect(onOpenBlock).toHaveBeenCalledWith(block)
  })
})

describe('NodeInspector chip maps and help (SPEC-0005/FR-006)', () => {
  const setup = () => {
    const graph = new LiteGraph.LGraph()
    const history = new GraphHistory(
      graph,
      () => [],
      () => undefined
    )
    const output = LiteGraph.createNode('output/output')
    output.properties.roles = 'EVIDENCE=quote, REASON=body'
    render(<NodeInspector selection={[output]} history={history} />)
    return output
  }

  it('edits the report lines as chips grouped by role', async () => {
    const output = setup()
    await userEvent.click(screen.getByText('Advanced'))
    const roles = screen.getByRole('group', { name: 'Report lines' })
    expect(within(roles).getByText('EVIDENCE')).toBeVisible()
    expect(within(roles).getByText('REASON')).toBeVisible()

    await userEvent.type(
      within(roles).getByLabelText('Add to Callout box'),
      'Next step{Enter}'
    )
    expect(output.properties.roles).toBe('EVIDENCE=quote, REASON=body, NEXT_STEP=callout')
    expect(within(roles).getByText('NEXT_STEP')).toBeVisible()

    await userEvent.click(
      within(roles)
        .getByLabelText('EVIDENCE in Quotation')
        .querySelector('.MuiChip-deleteIcon') as HTMLElement
    )
    expect(output.properties.roles).toBe('REASON=body, NEXT_STEP=callout')
  })

  it('opens a help dialog for the node and for a property', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Help: output' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(/KEY: value/)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await userEvent.click(screen.getByRole('button', { name: 'Help: Display' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(/report:/)
  })
})
