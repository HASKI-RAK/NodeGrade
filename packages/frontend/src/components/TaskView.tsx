import {
  type AnswerConstraints,
  checkAnswerLength,
  RunState,
  ServerEventPayload
} from '@haski/ta-lib'
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  IconButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'
import LinearProgress, { linearProgressClasses } from '@mui/material/LinearProgress'
import { styled } from '@mui/material/styles'
import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react'

import {
  DEFAULT_PREVIEW_LOCALE,
  type PreviewLocale,
  type PreviewMessages,
  previewMessages
} from '@/i18n/preview'

import { TraceView } from './TraceView'

interface MyThemeComponentProps {
  color?: 'primary' | 'secondary'
}

/** A score at or above this value counts as passed (SPEC-0007/FR-004). */
const PASS_THRESHOLD = 60

/**
 * based on value successPercentage, color progress bar changes
 */
const BorderLinearProgress = styled(LinearProgress)<
  MyThemeComponentProps & { value: number }
>(({ theme, value }) => ({
  height: 10,
  borderRadius: 5,
  [`&.${linearProgressClasses.colorPrimary}`]: {
    backgroundColor: theme.palette.grey[theme.palette.mode === 'light' ? 200 : 800]
  },
  [`& .${linearProgressClasses.bar}`]: {
    borderRadius: 5,
    backgroundColor: value >= PASS_THRESHOLD ? '#388E3C' : '#308fe8'
  }
}))

export type TaskViewHandle = {
  submit: () => boolean
  focusAnswer: () => void
}

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

/**
 * One result on its own card: the output node's label as title, the value as body.
 * The locate button is an editor affordance and only renders when a handler is given;
 * students see the card without it.
 */
const ResultCard = ({
  output,
  messages,
  onLocate
}: {
  output: Output
  messages: PreviewMessages
  onLocate?: () => void
}) => {
  const title =
    output.type === 'classifications'
      ? output.label || messages.classificationsHeading
      : output.label
  const passed =
    output.type === 'score' &&
    typeof output.value === 'number' &&
    output.value >= PASS_THRESHOLD

  const body = (() => {
    switch (output.type) {
      case 'text':
        return (
          <Typography
            variant="body1"
            sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
          >
            {String(output.value).trim()}
          </Typography>
        )
      case 'score':
        if (typeof output.value !== 'number') return null
        return (
          <Stack spacing={1}>
            <Typography variant="h4" component="p" fontWeight={600}>
              {output.value}
            </Typography>
            {output.value >= 0 && output.value <= 100 && (
              <BorderLinearProgress
                variant="determinate"
                value={output.value}
                aria-label={title}
              />
            )}
          </Stack>
        )
      case 'classifications':
        if (!Array.isArray(output.value)) return null
        return (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {output.value
              // Unconnected list inputs arrive as null over the wire; never show an empty chip.
              .filter(
                (classification): classification is string =>
                  typeof classification === 'string' && classification.trim().length > 0
              )
              .map((classification, index) => (
                <Chip
                  key={`${index}-${classification}`}
                  label={classification}
                  variant="outlined"
                />
              ))}
          </Stack>
        )
    }
  })()

  return (
    <Card variant="outlined" component="article" aria-label={title}>
      <CardContent sx={{ '&:last-child': { paddingBottom: 2 } }}>
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography
              variant="subtitle1"
              component="h3"
              fontWeight={600}
              sx={{ flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' }}
            >
              {title}
            </Typography>
            {passed && <Chip size="small" color="success" label={messages.passed} />}
            {onLocate && (
              <Tooltip title={messages.locateOutputNode(title)}>
                <IconButton
                  size="small"
                  aria-label={messages.locateOutputNode(title)}
                  onClick={onLocate}
                >
                  <CenterFocusStrongIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
          {body}
        </Stack>
      </CardContent>
    </Card>
  )
}

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
  const hasModelText = values.some((out) => out.type === 'text')
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
    onCancel?: () => void
    onSelectTraceNode?: SelectGraphNode
    /**
     * Editor-only: when given, every result card offers a button that jumps to the
     * output node that produced it. Leave undefined for students.
     */
    onSelectOutputNode?: SelectGraphNode
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
      onCancel = () => undefined,
      onSelectTraceNode = () => undefined,
      onSelectOutputNode
    },
    ref
  ) => {
    const messages = previewMessages[locale]
    const [tab, setTab] = useState<'test' | 'trace'>('test')
    const [answer, setAnswer] = useState('')
    const [error, setError] = useState<string | null>(null)
    const answerRef = useRef<HTMLInputElement>(null)

    // A started run has something to show on the Trace tab; the Test tab has nothing new
    // until it finishes.
    useEffect(() => {
      if (runState === 'queued' || runState === 'running') setTab('trace')
    }, [runState])

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

    const submit = (): boolean => {
      if (disabled) return false
      const message = lengthError(answer, constraints, messages)
      setError(message)
      if (message) return false
      onSubmit(answer)
      return true
    }

    const handleSubmit = (event?: React.FormEvent<HTMLFormElement>): void => {
      event?.preventDefault()
      submit()
    }

    useImperativeHandle(ref, () => ({
      submit,
      focusAnswer: () => answerRef.current?.focus()
    }))

    return (
      <Stack spacing={2} padding={2}>
        <Tabs value={tab} onChange={(_, value: 'test' | 'trace') => setTab(value)}>
          <Tab value="test" label={messages.testTab} />
          <Tab value="trace" label={messages.traceTab} />
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
        <Box hidden={tab !== 'test'}>
          <span id="rewardId" />
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
                  id="outlined-multiline-static"
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
                  disabled={disabled}
                />
                <Stack direction="row" spacing={2}>
                  <Button variant="contained" type="submit" disabled={disabled}>
                    {disabled ? messages.submitting : messages.submit}
                  </Button>
                  <Typography variant="caption">{messages.runHint}</Typography>
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
