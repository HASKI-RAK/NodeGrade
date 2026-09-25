import type { ServerEventPayload } from '@haski/ta-lib'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { previewMessages } from '@/i18n/preview'

import { ResultCard, type ResultOutput } from './ResultCard'
import TaskView from './TaskView'

const messages = previewMessages.en

type Output = ServerEventPayload['outputSet']

const output = (
  uniqueId: string,
  type: Output['type'],
  label: string,
  value: Output['value'],
  extra: Partial<Output> = {}
): Output => ({
  runId: 'run-1',
  workflowId: 'workflow-1',
  timestamp: '2026-09-25T00:00:00.000Z',
  uniqueId,
  type,
  label,
  value,
  ...extra
})

const card = (out: ResultOutput, viewer?: 'educator' | 'student') =>
  render(<ResultCard output={out} messages={messages} viewer={viewer} />)

const ASSESSMENT_REPLY = [
  'JUDGMENT: INCOMPLETE',
  'EVIDENCE: because the earth rotates',
  'REASON: The answer supports that Earth turns but not the lit and dark sides.',
  'NEXT STEP: What happens to the side facing the Sun?'
].join('\n')

describe('ResultCard display types (SPEC-0007/FR-004)', () => {
  it('renders a boolean verdict as Yes or No with the node explanation underneath', () => {
    card(
      output('1', 'verdict', 'Means the same as the reference', false, {
        detail: 'The entailment model found that the answer contradicts the reference.'
      })
    )
    const article = screen.getByRole('article', {
      name: 'Means the same as the reference'
    })
    expect(within(article).getByText('No')).toBeVisible()
    expect(
      within(article).getByText(/entailment model found that the answer contradicts/)
    ).toBeVisible()
    expect(within(article).queryByText('false')).toBeNull()
  })

  it('renders a token verdict with the tone map deciding its colour', () => {
    card(output('1', 'verdict', 'Judgment', 'TOO_VAGUE_OR_IRRELEVANT'))
    expect(screen.getByText('Too vague or irrelevant')).toBeVisible()
  })

  it('turns a KEY: value report into a headline chip, a quotation and a next step', () => {
    card(
      output('1', 'report', 'Conceptual assessment', ASSESSMENT_REPLY, {
        statusKey: 'JUDGMENT'
      })
    )
    const article = screen.getByRole('article', { name: 'Conceptual assessment' })
    expect(within(article).getByText('Incomplete')).toBeVisible()
    expect(within(article).getByText('because the earth rotates')).toBeVisible()
    expect(
      within(article).getByText(/The answer supports that Earth turns/)
    ).toBeVisible()
    expect(within(article).getByText('Next step')).toBeVisible()
    expect(
      within(article).getByText('What happens to the side facing the Sun?')
    ).toBeVisible()
    // The raw line prefixes never reach the learner.
    expect(within(article).queryByText(/JUDGMENT:/)).toBeNull()
    expect(within(article).queryByText(/EVIDENCE:/)).toBeNull()
  })

  it('shows the first-line points of a rubric report as a chip out of the maximum', () => {
    card(
      output('1', 'report', 'Evaporation', '1\nCRITERION: Evaporation\nGAP: no vapor.', {
        max: 2
      })
    )
    const article = screen.getByRole('article', { name: 'Evaporation' })
    expect(within(article).getByText('1 / 2')).toBeVisible()
    expect(within(article).getByText('Gap')).toBeVisible()
    expect(within(article).getByText('no vapor.')).toBeVisible()
  })

  it('falls back to prose when a report follows no KEY: contract', () => {
    card(output('1', 'report', 'Feedback', 'Well done, nothing to add.'))
    expect(screen.getByText('Well done, nothing to add.')).toBeVisible()
  })

  it('renders a checklist with ticked and crossed items', () => {
    card(
      output('1', 'checklist', 'Expected words', [
        { label: 'rotation', ok: false },
        { label: 'axis', ok: true }
      ])
    )
    const article = screen.getByRole('article', { name: 'Expected words' })
    expect(within(article).getByText('rotation')).toBeVisible()
    expect(within(article).getByText('axis')).toBeVisible()
    expect(within(article).getByTestId('CheckIcon')).toBeVisible()
    expect(within(article).getByTestId('CloseIcon')).toBeVisible()
  })

  it('renders a measure with its number and the evidence caption, never a pass chip', () => {
    card(output('1', 'measure', 'Similarity to the reference', 0.669))
    const article = screen.getByRole('article', { name: 'Similarity to the reference' })
    expect(within(article).getByText('0.669')).toBeVisible()
    expect(within(article).getByText(messages.measureCaption)).toBeVisible()
    expect(within(article).queryByText(messages.passed)).toBeNull()
    expect(within(article).queryByText(messages.notPassed)).toBeNull()
  })

  it('shows a score on its own scale without a chip when the pass mark is off', () => {
    card(output('1', 'score', 'Proposed points', 6, { max: 8, passMark: 0 }))
    const article = screen.getByRole('article', { name: 'Proposed points' })
    expect(within(article).getByText('6 / 8')).toBeVisible()
    expect(within(article).queryByText(messages.passed)).toBeNull()
    expect(within(article).queryByText(messages.notPassed)).toBeNull()
  })

  it('keeps the pass chip at 60 for a plain score and names a miss', () => {
    const { rerender } = render(
      <ResultCard output={output('1', 'score', 'Score', 100)} messages={messages} />
    )
    expect(screen.getByText('100')).toBeVisible()
    expect(screen.getByText(messages.passed)).toBeVisible()
    rerender(
      <ResultCard output={output('1', 'score', 'Score', 40)} messages={messages} />
    )
    expect(screen.getByText(messages.notPassed)).toBeVisible()
    expect(screen.queryByText(messages.passed)).toBeNull()
  })

  it('shows a placeholder instead of an empty card', () => {
    card(output('1', 'text', 'Expected words found', '   '))
    expect(screen.getByText(messages.noValue)).toBeVisible()
  })

  it('marks an educator-only card for educators but not in the student view', () => {
    const out = output('1', 'text', 'Decided by', 'nli-neutral', { audience: 'educator' })
    const { unmount } = card(out, 'educator')
    expect(screen.getByText(messages.educatorOnly)).toBeVisible()
    unmount()
    card(out, 'student')
    expect(screen.queryByText(messages.educatorOnly)).toBeNull()
  })
})

describe('TaskView results list (SPEC-0007/FR-011)', () => {
  const outputs = {
    a: output('1', 'checklist', 'Expected words', [{ label: 'axis', ok: true }], {
      section: 'A · Expected words'
    }),
    c: output('2', 'report', 'Conceptual assessment', ASSESSMENT_REPLY, {
      section: 'C · Conceptual assessment',
      statusKey: 'JUDGMENT'
    }),
    d: output('3', 'text', 'Decided by', 'nli-neutral', {
      section: 'D · Same meaning as the reference',
      audience: 'educator'
    }),
    flag: output('4', 'review', 'Needs a tutor?', '', {
      verdict: 'clear',
      audience: 'educator',
      section: 'C · Conceptual assessment'
    })
  }

  it('groups the cards under their section headings in order of first appearance', () => {
    render(<TaskView question="Q" onSubmit={vi.fn()} outputs={outputs} />)
    const results = screen.getByLabelText(messages.resultsHeading)
    const headings = within(results)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)
    expect(headings).toEqual([
      'A · Expected words',
      'Expected words',
      'C · Conceptual assessment',
      'Conceptual assessment',
      'Needs a tutor?',
      'D · Same meaning as the reference',
      'Decided by'
    ])
  })

  it('lets an educator preview the student view, which hides educator-only cards', async () => {
    const user = userEvent.setup()
    render(
      <TaskView
        question="Q"
        onSubmit={vi.fn()}
        outputs={outputs}
        onSelectOutputNode={vi.fn()}
      />
    )
    expect(screen.getByRole('article', { name: 'Decided by' })).toBeVisible()
    expect(screen.getAllByText(messages.educatorOnly)).toHaveLength(2)

    await user.click(screen.getByLabelText(messages.viewAsStudent))
    expect(screen.queryByRole('article', { name: 'Decided by' })).toBeNull()
    expect(screen.queryByRole('article', { name: 'Needs a tutor?' })).toBeNull()
    expect(screen.getByRole('article', { name: 'Conceptual assessment' })).toBeVisible()
    expect(screen.queryByText(messages.educatorOnly)).toBeNull()
    // The locate affordance is the editor's, so the student preview drops it too.
    expect(screen.queryByRole('button', { name: /on the canvas/ })).toBeNull()
    expect(screen.getByText(messages.hiddenFromStudents(2))).toBeVisible()
  })

  it('hides educator-only cards outright from a student and offers no toggle', () => {
    render(
      <TaskView question="Q" onSubmit={vi.fn()} outputs={outputs} viewer="student" />
    )
    expect(screen.queryByLabelText(messages.viewAsStudent)).toBeNull()
    expect(screen.queryByRole('article', { name: 'Decided by' })).toBeNull()
    expect(screen.getByRole('article', { name: 'Expected words' })).toBeVisible()
    expect(screen.queryByText(/hidden in this view/)).toBeNull()
  })
})

describe('ResultCard report roles (SPEC-0007/FR-004)', () => {
  it('draws each line by the role the node maps its key to, and hides hidden ones', () => {
    card(
      output(
        '1',
        'report',
        'Bewertung',
        'URTEIL: KORREKT\nBELEG: "die Erde dreht sich"\nBEGRÜNDUNG: Alles da.\nCRITERION: Rain\nTIPP: Weiter so.',
        {
          roles:
            'URTEIL=headline, BELEG=quote, BEGRÜNDUNG=body, TIPP=callout, CRITERION=hidden',
          toneMap: 'KORREKT=success'
        }
      )
    )
    const article = screen.getByRole('article', { name: 'Bewertung' })
    expect(within(article).getByText('Korrekt')).toBeVisible()
    expect(within(article).getByText('"die Erde dreht sich"').tagName).toBe('BLOCKQUOTE')
    expect(within(article).getByText('Alles da.')).toBeVisible()
    expect(within(article).getByText('Tipp')).toBeVisible()
    expect(within(article).queryByText('Rain')).toBeNull()
    expect(within(article).queryByText(/URTEIL/)).toBeNull()
  })

  it('still honours a saved headline key without a roles map', () => {
    card(
      output('1', 'report', 'Diagnosis', 'CATEGORY: MISCONCEPTION\nREASON: r', {
        statusKey: 'CATEGORY'
      })
    )
    expect(screen.getByText('Misconception')).toBeVisible()
    expect(screen.getByText('Reason')).toBeVisible()
  })
})
