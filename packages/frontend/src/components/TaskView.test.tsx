import type { ServerEventPayload } from '@haski/ta-lib'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import TaskView from './TaskView'

const output = (
  uniqueId: string,
  type: ServerEventPayload['outputSet']['type'],
  label: string,
  value: string | number | string[]
): ServerEventPayload['outputSet'] => ({
  runId: 'run-1',
  workflowId: 'workflow-1',
  timestamp: '2026-09-17T00:00:00.000Z',
  uniqueId,
  type,
  label,
  value
})

describe('TaskView', () => {
  it('runs any answer when the workflow declares no bounds (FR-008)', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<TaskView question="Question" onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Your answer'), 'short')
    await user.click(screen.getByRole('button', { name: 'Run assessment' }))

    expect(onSubmit).toHaveBeenCalledWith('short')
  })

  it('runs an empty answer when the workflow sets a minimum of zero (AC-006)', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <TaskView question="Question" onSubmit={onSubmit} constraints={{ minChars: 0 }} />
    )

    await user.click(screen.getByRole('button', { name: 'Run assessment' }))

    expect(onSubmit).toHaveBeenCalledWith('')
  })

  it('rejects a short answer against the configured minimum (AC-006)', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <TaskView question="Question" onSubmit={onSubmit} constraints={{ minChars: 20 }} />
    )

    await user.type(screen.getByLabelText('Your answer'), 'fifteen chars..')
    await user.click(screen.getByRole('button', { name: 'Run assessment' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(
      screen.getByText('This workflow asks for at least 20 characters.')
    ).toBeVisible()
  })

  it('rejects an answer beyond the configured maximum (AC-006a)', () => {
    const onSubmit = vi.fn()
    render(
      <TaskView question="Question" onSubmit={onSubmit} constraints={{ maxChars: 500 }} />
    )

    fireEvent.change(screen.getByLabelText('Your answer'), {
      target: { value: 'x'.repeat(600) }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run assessment' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('This workflow allows at most 500 characters.')).toBeVisible()
  })

  it('accepts a long answer when no maximum is configured (AC-006a)', () => {
    const onSubmit = vi.fn()
    render(<TaskView question="Question" onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText('Your answer'), {
      target: { value: 'x'.repeat(5000) }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run assessment' }))

    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('reports bounds that contradict each other (FR-008b)', () => {
    const onSubmit = vi.fn()
    render(
      <TaskView
        question="Question"
        onSubmit={onSubmit}
        constraints={{ minChars: 80, maxChars: 40 }}
      />
    )

    fireEvent.change(screen.getByLabelText('Your answer'), {
      target: { value: 'x'.repeat(60) }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run assessment' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        'This workflow asks for at least 80 characters but allows at most 40. Fix the answer node before running.'
      )
    ).toBeVisible()
  })

  it('shows the workflow question without offering a question field (AC-003)', () => {
    render(<TaskView question="Explain photosynthesis." onSubmit={vi.fn()} />)

    expect(screen.getByText('Explain photosynthesis.')).toBeVisible()
    expect(screen.queryByLabelText('Question')).not.toBeInTheDocument()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
  })

  it('shows score, classification and feedback together (AC-002)', () => {
    render(
      <TaskView
        question="Question"
        onSubmit={vi.fn()}
        outputs={{
          '10': output('10', 'score', 'Score', 72),
          '17': output('17', 'classifications', 'Classification', ['partially correct']),
          '24': output('24', 'text', 'Feedback', 'Name the outputs of the process.')
        }}
      />
    )

    expect(screen.getByRole('article', { name: 'Score' })).toBeVisible()
    expect(screen.getByText('72')).toBeVisible()
    expect(screen.getByText('partially correct')).toBeVisible()
    expect(screen.getByText('Name the outputs of the process.')).toBeVisible()
    expect(screen.getByText('Passed')).toBeVisible()
  })

  it('renders each output on its own card and states the model disclaimer once', () => {
    render(
      <TaskView
        question="Question"
        onSubmit={vi.fn()}
        outputs={{
          '3': output('3', 'text', 'Vocabulary found', 'context, strategy'),
          '5': output('5', 'text', 'Vocabulary not found', 'interface'),
          '8': output('8', 'text', 'Conceptual diagnosis', 'CATEGORY: UNCLEAR')
        }}
      />
    )

    const cards = screen.getAllByRole('article')
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'Vocabulary found',
      'Vocabulary not found',
      'Conceptual diagnosis'
    ])
    expect(
      screen.getAllByText(
        'Generated by a language model, so it can be wrong or misleading.'
      )
    ).toHaveLength(1)
  })

  it('lets the editor jump from a result card to the node that produced it', async () => {
    const onSelectOutputNode = vi.fn()
    const user = userEvent.setup()
    render(
      <TaskView
        question="Question"
        onSubmit={vi.fn()}
        onSelectOutputNode={onSelectOutputNode}
        outputs={{
          '2': {
            ...output('2', 'text', 'Feedback', 'Well done.'),
            wrapperId: null,
            sourceId: 42
          },
          '5': { ...output('5', 'score', 'Score', 30), wrapperId: 7, sourceId: 3 }
        }}
      />
    )

    await user.click(
      screen.getByRole('button', { name: 'Locate Feedback on the canvas' })
    )
    await user.click(screen.getByRole('button', { name: 'Locate Score on the canvas' }))

    expect(onSelectOutputNode).toHaveBeenNthCalledWith(1, 2, {
      wrapperId: null,
      sourceId: 42
    })
    expect(onSelectOutputNode).toHaveBeenNthCalledWith(2, 5, {
      wrapperId: 7,
      sourceId: 3
    })
  })

  it('shows students the result cards without the locate affordance', () => {
    render(
      <TaskView
        question="Question"
        onSubmit={vi.fn()}
        outputs={{
          '2': {
            ...output('2', 'text', 'Feedback', 'Well done.'),
            wrapperId: null,
            sourceId: 42
          }
        }}
      />
    )

    expect(screen.getByRole('article', { name: 'Feedback' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /on the canvas/ })
    ).not.toBeInTheDocument()
  })

  it('drops empty classification entries instead of rendering blank chips', () => {
    // An unconnected list input reaches the client as null inside the array.
    const value = ['partially correct', null, '  '] as unknown as string[]
    render(
      <TaskView
        question="Question"
        onSubmit={vi.fn()}
        outputs={{ '4': output('4', 'classifications', 'Classification', value) }}
      />
    )

    const card = screen.getByRole('article', { name: 'Classification' })
    expect(card).toBeVisible()
    expect(screen.getByText('partially correct')).toBeVisible()
    expect(card.querySelectorAll('.MuiChip-root')).toHaveLength(1)
  })

  it('labels the participant interface in English (AC-005)', () => {
    render(<TaskView question="A question" onSubmit={vi.fn()} />)

    expect(screen.getByRole('tab', { name: 'Test' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Trace' })).toBeVisible()
    expect(screen.getByText('Question')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Run assessment' })).toBeVisible()
    expect(
      screen.getByText('Run the workflow to see the score, classification and feedback.')
    ).toBeVisible()
  })

  it('submits a valid answer with Ctrl+Enter', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <TaskView question="Question" onSubmit={onSubmit} constraints={{ minChars: 10 }} />
    )
    const input = screen.getByLabelText('Your answer')

    await user.type(input, 'A sufficiently long answer')
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })

    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit).toHaveBeenCalledWith('A sufficiently long answer')
  })

  it('prevents another submission while an attempt is running', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    function RunningAttempt() {
      const [running, setRunning] = useState(false)
      return (
        <TaskView
          question="Question"
          disabled={running}
          onSubmit={(answer) => {
            onSubmit(answer)
            setRunning(true)
          }}
        />
      )
    }

    render(<RunningAttempt />)
    await user.type(screen.getByLabelText('Your answer'), 'A sufficiently long answer')
    await user.dblClick(screen.getByRole('button', { name: 'Run assessment' }))

    expect(onSubmit).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Assessing…' })).toBeDisabled()
  })

  it('shows trace outputs, expands values, cancels, and selects a node', async () => {
    const onCancel = vi.fn()
    const onSelectTraceNode = vi.fn()
    const user = userEvent.setup()
    const longValue = 'x'.repeat(600)

    render(
      <TaskView
        question="Question"
        onSubmit={vi.fn()}
        runId="run-1"
        runState="running"
        onCancel={onCancel}
        onSelectTraceNode={onSelectTraceNode}
        trace={[
          {
            runId: 'run-1',
            workflowId: 'workflow-1',
            nodeId: 7,
            nodeTitle: 'Intermediate',
            nodeType: 'basic/watch',
            state: 'completed',
            timestamp: '2026-09-16T00:00:00.000Z',
            durationMs: 12,
            outputs: [
              {
                slot: 0,
                name: 'Value',
                type: 'string',
                value: longValue,
                truncated: false
              }
            ]
          }
        ]}
      />
    )

    // A started run stays on the Test tab with inline progress; the trace is
    // one click away instead of a forced switch.
    expect(screen.getByLabelText('Your answer')).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Trace' }))
    expect(screen.getByText('Run: running')).toBeVisible()
    // Steps are collapsed by default: the duration chip shows in the header.
    expect(screen.getByText('12 ms')).toBeVisible()
    expect(screen.queryByText(longValue)).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('Toggle Intermediate'))
    // Long values stay truncated inside the expanded step until expanded.
    expect(screen.queryByText(longValue)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show more' }))
    expect(screen.getByText(longValue)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Select Intermediate' }))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onSelectTraceNode).toHaveBeenCalledWith(7)
  })

  it('stays on the Test tab when a run starts, with progress, cancel and a trace link', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <TaskView
        question="Question"
        onSubmit={vi.fn()}
        runState="running"
        progress={42}
        onCancel={onCancel}
      />
    )

    // No forced switch: the answer field stays visible with inline progress.
    expect(screen.getByLabelText('Your answer')).toBeVisible()
    expect(screen.getByText('Assessing… 42%')).toBeVisible()
    expect(screen.queryByText('Run: running')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'View trace' }))
    expect(screen.getByText('Run: running')).toBeVisible()
  })

  it('shows a queued run as waiting with a working cancel', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <TaskView
        question="Question"
        onSubmit={vi.fn()}
        runState="queued"
        onCancel={onCancel}
      />
    )

    expect(screen.getByText('Waiting to start…')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('shows a failed run error on the Test tab with a retry action', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <TaskView
        question="Question"
        onSubmit={onSubmit}
        runState="failed"
        runError="The run failed."
      />
    )

    expect(screen.getByText('The run failed.')).toBeVisible()
    await user.type(screen.getByLabelText('Your answer'), 'a valid answer here')
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onSubmit).toHaveBeenCalledWith('a valid answer here')
  })

  it('disables submit and warns while disconnected', () => {
    render(<TaskView question="Question" onSubmit={vi.fn()} connected={false} />)

    expect(screen.getByRole('button', { name: 'Run assessment' })).toBeDisabled()
    expect(
      screen.getByText(
        'Connection to the server is unavailable. Check your connection and retry.'
      )
    ).toBeVisible()
  })
})
