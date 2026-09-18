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
    backgroundColor: value >= 60 ? '#388E3C' : '#308fe8'
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

const Results = ({
  outputs,
  messages
}: {
  outputs?: Record<string, ServerEventPayload['outputSet']>
  messages: PreviewMessages
}) => {
  const values = Object.values(outputs ?? {})
  return (
    <Stack spacing={2} aria-label={messages.resultsHeading}>
      <Typography variant="h6">{messages.resultsHeading}</Typography>
      {values.length === 0 && (
        <Typography color="text.secondary">{messages.resultsEmpty}</Typography>
      )}
      {values.map((out) => {
        switch (out.type) {
          case 'text':
            return (
              <Stack key={out.uniqueId} spacing={0.5}>
                <Typography variant="subtitle1">{out.label}</Typography>
                <Typography
                  variant="body1"
                  sx={{
                    maxWidth: '50rem',
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere'
                  }}
                >
                  {String(out.value).trim()}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {messages.aiDisclaimer}
                </Typography>
              </Stack>
            )
          case 'score':
            if (typeof out.value !== 'number') return null
            return (
              <Stack key={out.uniqueId} spacing={1}>
                {out.value >= 60 && <Alert severity="success">{messages.passed}</Alert>}
                <Typography variant="subtitle1">
                  {out.label}: {out.value}
                </Typography>
                {out.value >= 0 && out.value <= 100 && (
                  <BorderLinearProgress variant="determinate" value={out.value} />
                )}
              </Stack>
            )
          case 'classifications':
            if (!Array.isArray(out.value)) return null
            return (
              <Stack key={out.uniqueId} spacing={0.5}>
                <Typography variant="subtitle1">
                  {messages.classificationsHeading}
                </Typography>
                {out.value.map((classification) => (
                  <Typography variant="body1" key={classification}>
                    {classification}
                  </Typography>
                ))}
              </Stack>
            )
        }
      })}
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
    onSelectTraceNode?: (
      nodeId: number,
      source?: { wrapperId?: number | null; sourceId?: number | null }
    ) => void
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
      onSelectTraceNode = () => undefined
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
                <Results outputs={outputs} messages={messages} />
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
