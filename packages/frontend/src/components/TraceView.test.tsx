import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TraceView } from './TraceView'

describe('TraceView', () => {
  it('shows ignored model parameter warnings with provider context', () => {
    render(
      <TraceView
        runState="completed"
        trace={[
          {
            runId: 'run-1',
            workflowId: 'workflow-1',
            timestamp: '2026-09-16T00:00:00.000Z',
            nodeId: 4,
            nodeTitle: 'LLM',
            nodeType: 'models/llm',
            state: 'completed',
            warnings: [
              {
                code: 'UNSUPPORTED_MODEL_PARAMETER',
                parameter: 'top_k',
                providerKey: 'openai',
                modelId: 'model-a'
              }
            ]
          }
        ]}
        onCancel={vi.fn()}
        onSelectNode={vi.fn()}
      />
    )

    expect(screen.getByText('top_k was ignored for model-a on openai.')).toBeVisible()
  })

  it('groups block traces under the wrapper label with inner detail', async () => {
    const onSelectNode = vi.fn()
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(
      <TraceView
        runState="completed"
        trace={[
          {
            runId: 'run-1',
            workflowId: 'workflow-1',
            timestamp: '2026-09-18T00:00:00.000Z',
            nodeId: 1,
            nodeTitle: 'Feedback Generator / Feedback model',
            nodeType: 'models/llm',
            state: 'completed',
            wrapperId: 9,
            sourceId: 2,
            wrapperPath: ['Feedback Generator'],
            outputs: [
              {
                slot: 0,
                name: 'string',
                type: 'string',
                value: 'good',
                truncated: false
              },
              { slot: 1, name: 'extra', type: 'string', value: 'more', truncated: false }
            ]
          },
          {
            runId: 'run-1',
            workflowId: 'workflow-1',
            timestamp: '2026-09-18T00:00:01.000Z',
            nodeId: 2,
            nodeTitle: 'Feedback Generator / Feedback',
            nodeType: 'output/output',
            state: 'completed',
            wrapperId: 9,
            sourceId: 3,
            wrapperPath: ['Feedback Generator']
          }
        ]}
        onCancel={vi.fn()}
        onSelectNode={onSelectNode}
      />
    )

    expect(screen.getByLabelText('Trace group Feedback Generator')).toBeVisible()
    expect(screen.getByText('2 steps inside block')).toBeVisible()
    expect(
      screen.getByLabelText('Select Feedback Generator / Feedback model')
    ).toBeVisible()
    expect(screen.getByText('Show 1 more output')).toBeVisible()
    await user.click(screen.getByLabelText('Select Feedback Generator / Feedback model'))
    expect(onSelectNode).toHaveBeenCalledWith(1, { wrapperId: 9, sourceId: 2 })
  })

  it('never groups a plain node whose title contains a slash', () => {
    render(
      <TraceView
        runState="completed"
        trace={[
          {
            runId: 'run-1',
            workflowId: 'workflow-1',
            timestamp: '2026-09-18T00:00:00.000Z',
            nodeId: 1,
            nodeTitle: 'A / B',
            nodeType: 'basic/watch',
            state: 'completed'
          }
        ]}
        onCancel={vi.fn()}
        onSelectNode={vi.fn()}
      />
    )

    expect(screen.queryByLabelText('Trace group A')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Select A / B')).toBeVisible()
  })
})
