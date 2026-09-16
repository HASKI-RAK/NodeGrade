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

    expect(screen.getByText('Score: 72')).toBeVisible()
    expect(screen.getByText('partially correct')).toBeVisible()
    expect(screen.getByText('Name the outputs of the process.')).toBeVisible()
    expect(screen.getByText('Passed')).toBeVisible()
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

    expect(screen.getByText('Run: running')).toBeVisible()
    expect(screen.getByText('12 ms')).toBeVisible()
    expect(screen.queryByText(longValue)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show more' }))
    expect(screen.getByText(longValue)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Select Intermediate' }))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onSelectTraceNode).toHaveBeenCalledWith(7)
  })
})
