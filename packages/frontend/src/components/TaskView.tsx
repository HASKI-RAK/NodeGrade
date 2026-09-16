import { RunState, ServerEventPayload } from '@haski/ta-lib'
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

import { TraceView } from './TraceView'

interface MyThemeComponentProps {
  color?: 'primary' | 'secondary'
}

/**
 * based on value of successPercentage, the color of the progress bar changes
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

const TaskView = forwardRef<
  TaskViewHandle,
  {
    onSubmit: (answer: string) => void
    outputs?: Record<string, ServerEventPayload['outputSet']>
    question: string
    questionImage?: string
    maxInputChars?: number
    disabled?: boolean
    runId?: string
    runState?: RunState
    trace?: ServerEventPayload['nodeExecutionChanged'][]
    onCancel?: () => void
    onSelectTraceNode?: (nodeId: number) => void
  }
>(
  (
    {
      onSubmit,
      outputs,
      question,
      questionImage,
      maxInputChars = 1200,
      disabled = false,
      runId,
      runState,
      trace = [],
      onCancel = () => undefined,
      onSelectTraceNode = () => undefined
    },
    ref
  ) => {
    const [error, setError] = useState<string | null>(null)
    const [answer, setAnswer] = useState<string>('')
    const [tab, setTab] = useState<'test' | 'trace'>('test')
    const answerRef = useRef<HTMLInputElement | null>(null)
    useEffect(() => {
      if (runState === 'queued' || runState === 'running') setTab('trace')
    }, [runState])
    const handleSetAnswer = (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextAnswer = event.target.value
      setAnswer(nextAnswer)
      if (error) validateAnswer(nextAnswer)
    }

    const validateAnswer = (value: string): boolean => {
      if (value.trim().length < 10) {
        setError('Answer must be at least 10 characters long')
        return false
      } else if (value.length > maxInputChars) {
        // TODO: find optimal length based on literature
        // to ensure the user doesnt paste a lot of text containing the answer
        setError('Answer must be at most ' + maxInputChars + ' characters long')
        return false
      } else {
        setError(null)
        return true
      }
    }

    const keyDownHandler = (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        handleSubmit()
      }
    }

    const submit = (): boolean => {
      if (disabled || !validateAnswer(answer)) return false
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
          <Tab value="test" label="Test" />
          <Tab value="trace" label="Trace" />
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
          <Typography variant="h4">Aufgabe:</Typography>
          {questionImage && (
            <img
              src={questionImage}
              alt="Question"
              style={{
                maxWidth: '100%',
                height: 'auto'
              }}
            />
          )}
          <Typography
            style={{
              maxWidth: '60rem' // Set a maximum width
            }}
            variant="body1"
          >
            {question}
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
                  label="Antwort"
                  multiline
                  error={!!error}
                  helperText={error}
                  rows={6}
                  placeholder="Gib hier deine Antwort ein..."
                  value={answer}
                  inputRef={answerRef}
                  onChange={handleSetAnswer}
                  onKeyDown={keyDownHandler}
                  disabled={disabled}
                />
                <Stack direction="row" spacing={2}>
                  <Button variant="contained" type="submit" disabled={disabled}>
                    {disabled ? 'Wird ausgewertet...' : 'Absenden'}
                  </Button>
                  <Typography variant="caption">
                    Hinweis: Die Auswertung kann bis zu zwei Minuten dauern. Bitte die
                    Seite nicht neu laden.
                  </Typography>
                </Stack>
                {/* Map over all outputs and display them */}
                {outputs &&
                  Object.values(outputs).map((out) => {
                    console.log('output: ', out)
                    switch (out.type) {
                      case 'text':
                        return (
                          <>
                            <Typography variant="h6">{out.label}</Typography>
                            <Typography
                              style={{
                                maxWidth: '50rem' // Set a maximum width
                              }}
                              variant="body1"
                            >
                              {out.value}
                            </Typography>
                            <Typography variant="body2">
                              Please note that answered generated by the system may be
                              incorrect or contain misleading information.
                            </Typography>
                          </>
                        )
                      case 'score':
                        // assert that output.value is a number
                        if (typeof out.value !== 'number') {
                          console.error(
                            'output.value is not a number, but of type: ',
                            typeof out.value
                          )
                          return null
                        }
                        return (
                          <>
                            {out.value >= 60 && (
                              <Alert severity="success">Bestanden!</Alert>
                            )}
                            <Typography variant="h6">
                              {out.label}: {out.value}
                            </Typography>
                            {out.value >= 0 && out.value <= 100 && (
                              <BorderLinearProgress
                                variant="determinate"
                                value={out.value}
                              />
                            )}
                          </>
                        )
                      case 'classifications':
                        // assert that output.value is an array of strings
                        if (!Array.isArray(out.value)) {
                          console.error(
                            'output.value is not an array, but of type: ',
                            typeof out.value
                          )
                          return null
                        }
                        // display chips with classifications
                        return (
                          <>
                            <Typography variant="h6">Classifications:</Typography>
                            {out.value.map((classification) => (
                              <Typography variant="body1" key={classification}>
                                {classification}
                              </Typography>
                            ))}
                          </>
                        )
                    }
                  })}
                {/* {outputs &&
              Object.values(outputs).map((out) => {
                if (out.type === 'score') {
                  if (typeof out.value !== 'number') return null
                  if (out.value >= 70) return <div key={out.label} />
                }
              })} */}
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
