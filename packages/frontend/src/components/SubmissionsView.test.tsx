import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError, type RunDetail, type RunSummary } from '@/api/http'
import { previewMessages } from '@/i18n/preview'

import { SubmissionsView, type SubmissionsViewProps } from './SubmissionsView'

const messages = previewMessages.en

const run = (overrides: Partial<RunSummary> = {}): RunSummary => ({
  id: 'run-1',
  outcome: 'COMPLETED',
  answerExcerpt: 'One quarter is bigger.',
  flagged: false,
  flagReason: null,
  needsReview: false,
  score: null,
  submittedBy: null,
  reviewedAt: null,
  reviewNote: null,
  startedAt: '2026-09-22T10:00:00.000Z',
  finishedAt: '2026-09-22T10:00:03.000Z',
  durationMs: 3000,
  ...overrides
})

const detail = (overrides: Partial<RunDetail> = {}): RunDetail => ({
  ...run(),
  answer: 'One quarter is bigger because four is more than two.',
  outputs: [
    { uniqueId: '7', type: 'text', label: 'Feedback', value: 'Look at the denominator.' },
    {
      uniqueId: '9',
      type: 'review',
      label: 'Needs a tutor?',
      value: 'Two claims contradict.',
      verdict: 'flagged'
    }
  ],
  errorMessage: null,
  ...overrides
})

const props = (overrides: Partial<SubmissionsViewProps> = {}): SubmissionsViewProps => ({
  messages,
  locale: 'en',
  runs: [],
  summary: { total: 0, needsReview: 0, reviewed: 0, failed: 0 },
  filter: 'all',
  loading: false,
  error: null,
  onFilterChange: vi.fn(),
  onRefresh: vi.fn(),
  onLoadDetail: vi.fn().mockResolvedValue(detail()),
  ...overrides
})

describe('SubmissionsView list', () => {
  it('shows the counts and one status chip per run (FR-009)', () => {
    render(
      <SubmissionsView
        {...props({
          runs: [
            run({ id: 'a', flagged: true, needsReview: true, score: 40 }),
            run({ id: 'b' }),
            run({ id: 'c', flagged: true, reviewedAt: '2026-09-22T11:00:00.000Z' }),
            run({ id: 'd', outcome: 'FAILED', answerExcerpt: '' })
          ],
          summary: { total: 4, needsReview: 1, reviewed: 1, failed: 1 }
        })}
      />
    )

    const counts = screen.getByRole('group', { name: 'Submission counts' })
    expect(within(counts).getByLabelText('Submissions')).toHaveTextContent('4')
    expect(within(counts).getByLabelText('Needs review')).toHaveTextContent('1')
    expect(within(counts).getByLabelText('Reviewed')).toHaveTextContent('1')

    const rows = within(
      screen.getByRole('list', { name: 'Submission list' })
    ).getAllByRole('button')
    expect(rows).toHaveLength(4)
    expect(within(rows[0]).getByText('Needs review')).toBeVisible()
    expect(within(rows[0]).getByText('Score 40')).toBeVisible()
    expect(within(rows[1]).getByText('No issue found')).toBeVisible()
    expect(within(rows[2]).getByText('Reviewed')).toBeVisible()
    expect(within(rows[3]).getByText('Failed')).toBeVisible()
    expect(within(rows[3]).getByText('Empty answer')).toBeVisible()
  })

  it('tells an empty inbox apart from an empty filter', () => {
    const { rerender } = render(<SubmissionsView {...props()} />)
    expect(
      screen.getByText(
        'No submissions yet. Run an answer to see it here as a tutor would.'
      )
    ).toBeVisible()

    rerender(<SubmissionsView {...props({ filter: 'reviewed' })} />)
    expect(screen.getByText('No submissions match this filter.')).toBeVisible()
  })

  it('reports a filter choice to the host', async () => {
    const onFilterChange = vi.fn()
    const user = userEvent.setup()
    render(<SubmissionsView {...props({ onFilterChange })} />)

    await user.click(
      within(screen.getByRole('group', { name: 'Filter submissions' })).getByRole(
        'button',
        {
          name: 'Needs review'
        }
      )
    )

    expect(onFilterChange).toHaveBeenCalledWith('needs-review')
  })

  it('offers a retry when the list failed to load', async () => {
    const onRefresh = vi.fn()
    const user = userEvent.setup()
    render(<SubmissionsView {...props({ error: { code: 'x' }, onRefresh })} />)

    expect(screen.getByText('Submissions could not be loaded.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('says when the list is cut', () => {
    render(
      <SubmissionsView
        {...props({
          runs: [run()],
          summary: { total: 60, needsReview: 0, reviewed: 0, failed: 0 }
        })}
      />
    )
    expect(screen.getByText('Showing the latest 1 submissions.')).toBeVisible()
  })
})

describe('SubmissionsView detail', () => {
  const flaggedRun = run({
    flagged: true,
    needsReview: true,
    flagReason: 'Contradiction.'
  })

  it('opens a run with its answer, reason and result cards, and comes back (FR-010)', async () => {
    const onLoadDetail = vi
      .fn()
      .mockResolvedValue(detail({ ...flaggedRun, flagReason: 'Contradiction.' }))
    const user = userEvent.setup()
    render(<SubmissionsView {...props({ runs: [flaggedRun], onLoadDetail })} />)

    await user.click(
      within(screen.getByRole('list', { name: 'Submission list' })).getByRole('button')
    )

    expect(onLoadDetail).toHaveBeenCalledWith('run-1')
    const view = await screen.findByLabelText('Submission')
    expect(
      within(view).getByText('One quarter is bigger because four is more than two.')
    ).toBeVisible()
    expect(within(view).getByText('Why it was flagged')).toBeVisible()
    expect(within(view).getByText('Contradiction.', { exact: true })).toBeVisible()
    const results = within(view).getByLabelText('Results')
    expect(within(results).getByRole('article', { name: 'Feedback' })).toBeVisible()
    expect(within(results).getByRole('article', { name: 'Needs a tutor?' })).toBeVisible()
    // Stored outputs cannot be located on the canvas: the card has no such button.
    expect(within(results).queryByRole('button', { name: /Locate/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Back to submissions' }))
    expect(screen.getByRole('list', { name: 'Submission list' })).toBeVisible()
  })

  it('marks a run reviewed with a note and reopens it (FR-011)', async () => {
    const reviewed = run({
      ...flaggedRun,
      needsReview: false,
      reviewedAt: '2026-09-22T11:00:00.000Z',
      reviewNote: 'Checked the fractions.'
    })
    const onSetReview = vi
      .fn()
      .mockResolvedValueOnce(reviewed)
      .mockResolvedValueOnce(run({ ...flaggedRun }))
    const user = userEvent.setup()
    render(
      <SubmissionsView
        {...props({
          runs: [flaggedRun],
          // No review card here, so the only "Needs review" on screen is the status chip.
          onLoadDetail: vi.fn().mockResolvedValue(detail({ ...flaggedRun, outputs: [] })),
          onSetReview
        })}
      />
    )
    await user.click(
      screen
        .getByRole('list', { name: 'Submission list' })
        .querySelector('[role=button]')!
    )
    const view = await screen.findByLabelText('Submission')
    expect(within(view).getByText('Needs review')).toBeVisible()

    await user.type(screen.getByLabelText('Note (optional)'), 'Checked the fractions.')
    await user.click(screen.getByRole('button', { name: 'Mark as reviewed' }))

    expect(onSetReview).toHaveBeenCalledWith('run-1', {
      reviewed: true,
      note: 'Checked the fractions.'
    })
    expect(await screen.findByRole('button', { name: 'Reopen' })).toBeVisible()
    expect(within(view).getByText('Reviewed', { exact: true })).toBeVisible()
    expect(within(view).getByText('Checked the fractions.')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Reopen' }))
    expect(onSetReview).toHaveBeenLastCalledWith('run-1', { reviewed: false })
    expect(await screen.findByRole('button', { name: 'Mark as reviewed' })).toBeVisible()
  })

  it('reports a review that could not be saved', async () => {
    const user = userEvent.setup()
    render(
      <SubmissionsView
        {...props({
          runs: [flaggedRun],
          onLoadDetail: vi.fn().mockResolvedValue(detail(flaggedRun)),
          onSetReview: vi.fn().mockRejectedValue(new Error('offline'))
        })}
      />
    )
    await user.click(
      screen
        .getByRole('list', { name: 'Submission list' })
        .querySelector('[role=button]')!
    )
    await screen.findByLabelText('Submission')

    await user.click(screen.getByRole('button', { name: 'Mark as reviewed' }))

    expect(await screen.findByText('The review could not be saved.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Mark as reviewed' })).toBeEnabled()
  })

  it('runs the stored answer again and returns to the list, unless the host cannot run (FR-012)', async () => {
    const onRunAgain = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <SubmissionsView {...props({ runs: [run()], onRunAgain, runDisabled: true })} />
    )
    await user.click(
      screen
        .getByRole('list', { name: 'Submission list' })
        .querySelector('[role=button]')!
    )
    await screen.findByLabelText('Submission')
    expect(screen.getByRole('button', { name: 'Run again' })).toBeDisabled()

    rerender(<SubmissionsView {...props({ runs: [run()], onRunAgain })} />)
    await user.click(screen.getByRole('button', { name: 'Run again' }))

    expect(onRunAgain).toHaveBeenCalledWith(
      'One quarter is bigger because four is more than two.'
    )
    // The new run shows up in the list, so the inbox is back on it.
    expect(screen.getByRole('list', { name: 'Submission list' })).toBeVisible()
    expect(screen.queryByLabelText('Submission')).toBeNull()
  })

  it('is read-only without review and run handlers', async () => {
    const user = userEvent.setup()
    render(<SubmissionsView {...props({ runs: [flaggedRun] })} />)
    await user.click(
      screen
        .getByRole('list', { name: 'Submission list' })
        .querySelector('[role=button]')!
    )
    await screen.findByLabelText('Submission')

    expect(screen.queryByRole('button', { name: 'Mark as reviewed' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Run again' })).toBeNull()
  })

  it('shows a failed run with its error and no review controls', async () => {
    const failed = run({ outcome: 'FAILED' })
    const user = userEvent.setup()
    render(
      <SubmissionsView
        {...props({
          runs: [failed],
          onLoadDetail: vi
            .fn()
            .mockResolvedValue(
              detail({ ...failed, outputs: [], errorMessage: 'Run failed.' })
            ),
          onSetReview: vi.fn()
        })}
      />
    )
    await user.click(
      screen
        .getByRole('list', { name: 'Submission list' })
        .querySelector('[role=button]')!
    )
    const view = await screen.findByLabelText('Submission')

    expect(within(view).getByText('Run failed.')).toBeVisible()
    expect(within(view).getByText('This run produced no outputs.')).toBeVisible()
    expect(screen.queryByText('Tutor review')).toBeNull()
  })

  it('tells the participant when the submission is gone', async () => {
    const user = userEvent.setup()
    render(
      <SubmissionsView
        {...props({
          runs: [run()],
          onLoadDetail: vi
            .fn()
            .mockRejectedValue(
              new ApiError(404, { code: 'run_not_found', message: 'gone' })
            )
        })}
      />
    )
    await user.click(
      screen
        .getByRole('list', { name: 'Submission list' })
        .querySelector('[role=button]')!
    )

    expect(await screen.findByText('This submission no longer exists.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })
})
