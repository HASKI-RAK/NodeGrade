import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import TaskView from './TaskView'

describe('TaskView', () => {
  it('does not submit an invalid answer', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<TaskView question="Question" onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Antwort'), 'short')
    await user.click(screen.getByRole('button', { name: 'Absenden' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Answer must be at least 10 characters long')).toBeVisible()
  })

  it('submits a valid answer with Ctrl+Enter', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<TaskView question="Question" onSubmit={onSubmit} />)
    const input = screen.getByLabelText('Antwort')

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
    await user.type(screen.getByLabelText('Antwort'), 'A sufficiently long answer')
    await user.dblClick(screen.getByRole('button', { name: 'Absenden' }))

    expect(onSubmit).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Wird ausgewertet...' })).toBeDisabled()
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
