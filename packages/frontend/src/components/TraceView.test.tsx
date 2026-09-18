import type { ServerEventPayload } from '@haski/ta-lib'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TraceView } from './TraceView'

const baseTraceProps = {
  onCancel: vi.fn(),
  onSelectNode: vi.fn()
}

type TraceStep = ServerEventPayload['nodeExecutionChanged']

const warningStep: TraceStep = {
  runId: 'run-1',
  workflowId: 'workflow-1',
  timestamp: '2026-09-16T00:00:00.000Z',
  nodeId: 4,
  nodeTitle: 'LLM',
  nodeType: 'models/llm',
  state: 'completed',
  warnings: [
    {
      code: 'UNSUPPORTED_MODEL_PARAMETER' as const,
      parameter: 'top_k',
      providerKey: 'openai',
      modelId: 'model-a'
    }
  ]
}

describe('TraceView', () => {
  it('keeps entries collapsed by default and expands on toggle', async () => {
    const onSelectNode = vi.fn()
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(
      <TraceView
        runState="completed"
        trace={[warningStep]}
        onCancel={vi.fn()}
        onSelectNode={onSelectNode}
      />
    )

    // Summary, counts and collapsed header are visible; the detail is not.
    expect(screen.getByText(/1 step · 0 errors · 1 warning/)).toBeVisible()
    expect(screen.getByLabelText('Toggle LLM')).toBeVisible()
    expect(
      screen.queryByText('top_k was ignored for model-a on openai.')
    ).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('Toggle LLM'))
    expect(screen.getByText('top_k was ignored for model-a on openai.')).toBeVisible()

    await user.click(screen.getByLabelText('Select LLM'))
    expect(onSelectNode).toHaveBeenCalledWith(4)
  })

  it('auto-expands failed steps while other steps stay collapsed', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(
      <TraceView
        runState="failed"
        trace={[
          warningStep,
          {
            runId: 'run-1',
            workflowId: 'workflow-1',
            timestamp: '2026-09-16T00:00:01.000Z',
            nodeId: 5,
            nodeTitle: 'Scorer',
            nodeType: 'basic/scorer',
            state: 'failed',
            error: { code: 'node_failed' as const, message: 'boom' }
          }
        ]}
        onCancel={vi.fn()}
        onSelectNode={vi.fn()}
      />
    )

    expect(screen.getByText('boom')).toBeVisible()
    expect(
      screen.queryByText('top_k was ignored for model-a on openai.')
    ).not.toBeInTheDocument()

    // Collapsing a failure is sticky: re-renders must not re-expand it. The
    // collapsed header still shows the error snippet; the detail Alert hides.
    await user.click(screen.getByLabelText('Toggle Scorer'))
    expect(screen.getByTestId('trace-step-5-error-snippet')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('filters errors and warnings like a console log', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(
      <TraceView
        runState="failed"
        trace={[
          warningStep,
          {
            runId: 'run-1',
            workflowId: 'workflow-1',
            timestamp: '2026-09-16T00:00:01.000Z',
            nodeId: 5,
            nodeTitle: 'Scorer',
            nodeType: 'basic/scorer',
            state: 'failed',
            error: { code: 'node_failed' as const, message: 'boom' }
          }
        ]}
        onCancel={vi.fn()}
        onSelectNode={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'All (2)' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Errors (1)' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Warnings (1)' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Errors (1)' }))
    expect(screen.queryByLabelText('Toggle LLM')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Toggle Scorer')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Warnings (1)' }))
    expect(screen.getByLabelText('Toggle LLM')).toBeVisible()
    expect(screen.queryByLabelText('Toggle Scorer')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'All (2)' }))
    expect(screen.getByLabelText('Toggle LLM')).toBeVisible()
    expect(screen.getByLabelText('Toggle Scorer')).toBeVisible()
  })

  it('warns filter reports an empty run and resets for the next run', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const { rerender } = render(
      <TraceView runState="completed" trace={[warningStep]} {...baseTraceProps} />
    )

    await user.click(screen.getByRole('button', { name: 'Errors (0)' }))
    expect(screen.getByText('No errors in this run.')).toBeVisible()

    rerender(<TraceView runState="queued" trace={[]} {...baseTraceProps} />)
    rerender(
      <TraceView
        runState="completed"
        trace={[{ ...warningStep, nodeId: 6 }]}
        {...baseTraceProps}
      />
    )
    expect(screen.getByRole('button', { name: 'All (1)' })).toBeVisible()
    expect(screen.queryByText('No errors in this run.')).not.toBeInTheDocument()
  })

  it('supports expand-all, collapse-all and jump-to-first-error', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(
      <TraceView
        runState="failed"
        trace={[
          warningStep,
          {
            runId: 'run-1',
            workflowId: 'workflow-1',
            timestamp: '2026-09-16T00:00:01.000Z',
            nodeId: 5,
            nodeTitle: 'Scorer',
            nodeType: 'basic/scorer',
            state: 'failed',
            error: { code: 'node_failed' as const, message: 'boom' },
            outputs: [
              {
                slot: 0,
                name: 'score',
                type: 'number',
                value: 12,
                truncated: false
              }
            ]
          }
        ]}
        onCancel={vi.fn()}
        onSelectNode={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Collapse all' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(screen.getByText('top_k was ignored for model-a on openai.')).toBeVisible()
    expect(screen.getAllByText('boom').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Collapse all' }))
    await user.click(screen.getByRole('button', { name: 'Jump to first error' }))
    expect(screen.getAllByText('boom').length).toBeGreaterThan(0)
    expect(
      screen.queryByText('top_k was ignored for model-a on openai.')
    ).not.toBeInTheDocument()
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
    const toggle = screen.getByLabelText('Toggle Feedback Generator / Feedback model')
    expect(toggle).toBeVisible()
    // Collapsed header shows the output count; content renders after expansion.
    expect(within(toggle).getByText('2 outputs')).toBeVisible()
    expect(screen.queryByText('good')).not.toBeInTheDocument()

    await user.click(toggle)
    expect(screen.getByText('good')).toBeVisible()
    expect(screen.getByText('more')).toBeVisible()

    await user.click(screen.getByLabelText('Select Feedback Generator / Feedback model'))
    expect(onSelectNode).toHaveBeenCalledWith(1, { wrapperId: 9, sourceId: 2 })
  })

  it('never groups a plain node whose title contains a slash', async () => {
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
            nodeTitle: 'A / B',
            nodeType: 'basic/watch',
            state: 'completed',
            outputs: [
              {
                slot: 0,
                name: 'value',
                type: 'string',
                value: 'seen',
                truncated: false
              }
            ]
          }
        ]}
        onCancel={vi.fn()}
        onSelectNode={vi.fn()}
      />
    )

    expect(screen.queryByLabelText('Trace group A')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Toggle A / B')).toBeVisible()
    expect(screen.queryByText('seen')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('Toggle A / B'))
    expect(screen.getByText('seen')).toBeVisible()
  })
})
