import type { RunState, ServerEventPayload } from '@haski/ta-lib'
import { Alert, Box, Button, Chip, Divider, Stack, Typography } from '@mui/material'
import { useState } from 'react'

const TraceValue = ({ value }: { value: unknown }) => {
  const text =
    typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? String(value))
  const [expanded, setExpanded] = useState(false)
  const long = text.length > 500
  return (
    <Stack spacing={0.5}>
      <Typography
        component="pre"
        sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
      >
        {long && !expanded ? `${text.slice(0, 500)}…` : text}
      </Typography>
      {long && (
        <Button size="small" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      )}
    </Stack>
  )
}

export const TraceView = ({
  runId,
  runState,
  trace,
  onCancel,
  onSelectNode
}: {
  runId?: string
  runState?: RunState
  trace: ServerEventPayload['nodeExecutionChanged'][]
  onCancel: () => void
  onSelectNode: (nodeId: number) => void
}) => (
  <Stack spacing={2} padding={2} aria-label="Run trace">
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography variant="h6">Run: {runState ?? 'idle'}</Typography>
      {(runState === 'queued' || runState === 'running') && (
        <Button color="warning" onClick={onCancel} disabled={!runId}>
          Cancel
        </Button>
      )}
    </Stack>
    {trace.length === 0 && (
      <Typography color="text.secondary">Run workflow to see trace.</Typography>
    )}
    {trace.map((step) => (
      <Box
        key={step.nodeId}
        role="button"
        tabIndex={0}
        aria-label={`Select ${step.nodeTitle}`}
        onClick={() => onSelectNode(step.nodeId)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelectNode(step.nodeId)
          }
        }}
        sx={{
          textAlign: 'left',
          p: 1,
          cursor: 'pointer'
        }}
      >
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography fontWeight={600}>{step.nodeTitle}</Typography>
            <Chip size="small" label={step.state} />
            {step.durationMs !== undefined && (
              <Typography variant="caption">{step.durationMs} ms</Typography>
            )}
          </Stack>
          {step.error && <Alert severity="error">{step.error.message}</Alert>}
          {step.warnings?.map((warning) => (
            <Alert severity="warning" key={`${warning.code}-${warning.parameter}`}>
              {warning.parameter} was ignored for {warning.modelId} on{' '}
              {warning.providerKey}.
            </Alert>
          ))}
          {step.outputs?.map((output) => (
            <Stack key={output.slot} spacing={0.5}>
              <Typography variant="caption">{output.name}</Typography>
              <TraceValue value={output.value} />
              {output.truncated && (
                <Typography variant="caption">Output truncated at 64 KiB.</Typography>
              )}
            </Stack>
          ))}
          <Divider />
        </Stack>
      </Box>
    ))}
  </Stack>
)
