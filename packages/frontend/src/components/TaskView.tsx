import {
  type AnswerConstraints,
  checkAnswerLength,
  RunState,
  ServerEventPayload
} from '@haski/ta-lib'
import {
  Alert,
  Box,
  Button,
  FormControl,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material'
import LinearProgress from '@mui/material/LinearProgress'
import { forwardRef, memo, useImperativeHandle, useRef, useState } from 'react'

import {
  DEFAULT_PREVIEW_LOCALE,
  type PreviewLocale,
  type PreviewMessages,
  previewMessages
} from '@/i18n/preview'

import { ResultCard } from './ResultCard'
import { SubmissionsView, type SubmissionsViewProps } from './SubmissionsView'
import { TraceView } from './TraceView'

export type TaskViewHandle = {
  submit: () => boolean
  focusAnswer: () => void
}

type PreviewTab = 'test' | 'trace' | 'submissions'

/** What the host supplies for the Submissions tab; strings and run-again are TaskView's. */
export type TaskViewSubmissions = Omit<
  SubmissionsViewProps,
  'messages' | 'locale' | 'onRunAgain' | 'runDisabled'
>

const lengthError = (
  answer: string,
  constraints: AnswerConstraints,
  messages: PreviewMessages
): string | null => {
  const violation = checkAnswerLength(answer, constraints)
  if (!violation) return null
  if (violation.code === 'too_short') return messages.answerTooShort(violation.minChars)
  if (violation.code === 'too_long') return messages.answerTooLong(violation.maxChars)
  return messages.answerBoundsConflict(violation.minChars, violation.maxChars)
}

/** Selects and centers a node on the canvas, resolving block-inner nodes via source. */
export type SelectGraphNode = (
  nodeId: number,
  source?: { wrapperId?: number | null; sourceId?: number | null }
) => void

type Output = ServerEventPayload['outputSet']

const Results = ({
  outputs,
  messages,
  onSelectOutputNode
}: {
  outputs?: Record<string, Output>
  messages: PreviewMessages
  onSelectOutputNode?: SelectGraphNode
}) => {
  const values = Object.values(outputs ?? {})
  const hasModelText = values.some((out) => out.type === 'text' || out.type === 'review')
  return (
    <Stack spacing={1.5} aria-label={messages.resultsHeading}>
      <Typography variant="h6">{messages.resultsHeading}</Typography>
      {values.length === 0 && (
        <Typography color="text.secondary">{messages.resultsEmpty}</Typography>
      )}
      {values.map((out) => (
        <ResultCard
          key={out.uniqueId}
          output={out}
          messages={messages}
          onLocate={
            onSelectOutputNode &&
            (() =>
              onSelectOutputNode(Number(out.uniqueId), {
                wrapperId: out.wrapperId ?? null,
                sourceId: out.sourceId ?? null
              }))
          }
        />
      ))}
      {hasModelText && (
        <Typography variant="caption" color="text.secondary">
          {messages.aiDisclaimer}
        </Typography>
      )}
    </Stack>
  )
}

/**
 * The participant preview: a Test tab that poses the workflow's question and runs an
 * answer against it, next to the run trace (SPEC-0007/FR-002, FR-005).
 *
 * The question is read-only. It belongs to the workflow's question node and is edited in
 * the inspector (FR-003), so a test run only ever varies the answer. Answer length is the
 * workflow's business too: this component holds no length rule of its own (FR-008).
 */
const TaskView = forwardRef<
  TaskViewHandle,
  {
    onSubmit: (answer: string) => void
    outputs?: Record<string, ServerEventPayload['outputSet']>
    question: string
    questionImage?: string
    constraints?: AnswerConstraints
    locale?: PreviewLocale
    disabled?: boolean
    runId?: string
    runState?: RunState
    trace?: ServerEventPayload['nodeExecutionChanged'][]
    /** Terminal failure/cancel message for the in-flight attempt, shown on Test tab. */
    runError?: string
    /** False while the socket is down: submitting is disabled with a hint. */
    connected?: boolean
    /** 0-100 run progress for the inline Test-tab indicator. */
    progress?: number
    onCancel?: () => void
    onSelectTraceNode?: SelectGraphNode
    /**
     * Editor-only: when given, every result card offers a button that jumps to the
     * output node that produced it. Leave undefined for students.
     */
    onSelectOutputNode?: SelectGraphNode
    /**
     * Editor-only: the Submissions inbox (SPEC-0020/FR-009). Leave undefined for
     * students, who share a workspace and must not see each other's runs (FR-007).
     */
    submissions?: TaskViewSubmissions
  }
>(
  (
    {
      onSubmit,
      outputs,
      question,
      questionImage,
      constraints = {},
      locale = DEFAULT_PREVIEW_LOCALE,
      disabled = false,
      runId,
      runState,
      trace = [],
      runError,
      connected = true,
      progress = 0,
      onCancel = () => undefined,
      onSelectTraceNode = () => undefined,
      onSelectOutputNode,
      submissions
    },
    ref
  ) => {
    const messages = previewMessages[locale]
    const [tab, setTab] = useState<PreviewTab>('test')
    const [answer, setAnswer] = useState('')
    const [error, setError] = useState<string | null>(null)
    const answerRef = useRef<HTMLInputElement>(null)
    const running = runState === 'queued' || runState === 'running'
    const submitDisabled = disabled || !connected

    const handleSetAnswer = (event: React.ChangeEvent<HTMLInputElement>): void => {
      const nextAnswer = event.target.value
      setAnswer(nextAnswer)
      if (error) setError(lengthError(nextAnswer, constraints, messages))
    }

    const keyDownHandler = (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        handleSubmit()
      }
    }

    const submitAnswer = (value: string): boolean => {
      if (submitDisabled) return false
      const message = lengthError(value, constraints, messages)
      setError(message)
      if (message) return false
      onSubmit(value)
      return true
    }

    const submit = (): boolean => submitAnswer(answer)

    const handleSubmit = (event?: React.FormEvent<HTMLFormElement>): void => {
      event?.preventDefault()
      submit()
    }

    // "Run again" from a stored submission: the old answer lands in the Test tab and
    // runs against whatever the graph is now (FR-012).
    const runAgain = (value: string): void => {
      setAnswer(value)
      setTab('test')
      submitAnswer(value)
    }

    useImperativeHandle(ref, () => ({
      submit,
      focusAnswer: () => answerRef.current?.focus()
    }))

    return (
      <Stack spacing={2} padding={2}>
        <Tabs
          value={tab}
          onChange={(_, value: PreviewTab) => setTab(value)}
          aria-label="Preview"
        >
          <Tab value="test" label={messages.testTab} />
          <Tab value="trace" label={messages.traceTab} />
          {submissions && (
            <Tab
              value="submissions"
              label={messages.submissionsTab(submissions.summary.needsReview)}
            />
          )}
        </Tabs>
        {tab === 'trace' && (
          <TraceView
            runId={runId}
            runState={runState}
            trace={trace}
            onCancel={onCancel}
            onSelectNode={onSelectTraceNode}
          />
        )}
        {submissions && (
          // Hidden rather than unmounted, so an open submission survives a look at Test.
          <Box hidden={tab !== 'submissions'}>
            <SubmissionsView
              {...submissions}
              messages={messages}
              locale={locale}
              onRunAgain={runAgain}
              runDisabled={submitDisabled}
            />
          </Box>
        )}
        <Box hidden={tab !== 'test'}>
          <Typography variant="h5">{messages.questionHeading}</Typography>
          {questionImage && (
            <img
              src={questionImage}
              alt={messages.questionHeading}
              style={{
                maxWidth: '100%',
                height: 'auto'
              }}
            />
          )}
          <Typography
            variant="body1"
            sx={{ maxWidth: '60rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
          >
            {question || messages.questionMissing}
          </Typography>
          <form
            onSubmit={handleSubmit}
            noValidate
            autoComplete="off"
            style={{ width: '100%' }}
          >
            <FormControl fullWidth error={!!error}>
              <Stack spacing={2}>
                <TextField
                  id="preview-answer"
                  label={messages.answerLabel}
                  multiline
                  error={!!error}
                  helperText={error}
                  rows={6}
                  placeholder={messages.answerPlaceholder}
                  value={answer}
                  inputRef={answerRef}
                  onChange={handleSetAnswer}
                  onKeyDown={keyDownHandler}
                  disabled={submitDisabled}
                  aria-describedby="preview-run-status"
                />
                <Stack direction="row" spacing={2} alignItems="center">
                  <Button
                    variant="contained"
                    type="submit"
                    disabled={submitDisabled}
                    title={connected ? undefined : messages.runDisconnected}
                  >
                    {disabled ? messages.submitting : messages.submit}
                  </Button>
                  {running && (
                    <Button color="warning" onClick={onCancel}>
                      Cancel
                    </Button>
                  )}
                  <Typography variant="caption">{messages.runHint}</Typography>
                </Stack>
                <Stack id="preview-run-status" spacing={1} aria-live="polite">
                  {!connected && (
                    <Alert severity="warning">{messages.runDisconnected}</Alert>
                  )}
                  {running && (
                    <>
                      <Typography variant="caption" color="text.secondary">
                        {runState === 'queued'
                          ? messages.waitingToStart
                          : messages.assessingProgress(progress)}
                      </Typography>
                      <LinearProgress
                        variant={progress > 0 ? 'determinate' : 'indeterminate'}
                        value={progress}
                      />
                      <Button size="small" onClick={() => setTab('trace')}>
                        {messages.viewTrace}
                      </Button>
                    </>
                  )}
                  {runError && !running && (
                    <Alert
                      severity={runState === 'cancelled' ? 'warning' : 'error'}
                      action={
                        <Button size="small" color="inherit" onClick={() => submit()}>
                          {messages.retry}
                        </Button>
                      }
                    >
                      {runError}
                    </Alert>
                  )}
                </Stack>
                <Results
                  outputs={outputs}
                  messages={messages}
                  onSelectOutputNode={onSelectOutputNode}
                />
              </Stack>
            </FormControl>
          </form>
        </Box>
      </Stack>
    )
  }
)
TaskView.displayName = 'TaskView'
export default memo(TaskView)
