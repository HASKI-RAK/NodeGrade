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
  onSelectNode: (
    nodeId: number,
    source?: { wrapperId?: number | null; sourceId?: number | null }
  ) => void
}) => {
  const groups = groupTraceByBlock(trace)
  return (
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
      {groups.map((group, index) =>
        group.block === null ? (
          group.steps.map((step) => (
            <TraceStep
              key={`${step.nodeId}-${index}`}
              step={step}
              onSelectNode={onSelectNode}
            />
          ))
        ) : (
          <Box
            key={`${group.block}-${index}`}
            aria-label={`Trace group ${group.block}`}
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              p: 1
            }}
          >
            <Typography fontWeight={600}>{group.block}</Typography>
            <Typography color="text.secondary" variant="caption">
              {group.steps.length} step{group.steps.length === 1 ? '' : 's'} inside block
            </Typography>
            {group.steps.map((step) => (
              <TraceStep
                key={`${step.nodeId}-${index}`}
                step={step}
                inner
                onSelectNode={onSelectNode}
              />
            ))}
          </Box>
        )
      )}
    </Stack>
  )
}

type TraceStep = ServerEventPayload['nodeExecutionChanged']

// Grouping is presentation only: the server emits structured wrapperId/sourceId on
// every step, and the block label derives from wrapperPath. Titles containing " / "
// never misgroup because grouping keys on identity, not on parsed titles.
const groupTraceByBlock = (
  trace: TraceStep[]
): { block: string | null; steps: TraceStep[] }[] => {
  const groups: { block: string | null; steps: TraceStep[] }[] = []
  const blockOf = (step: TraceStep): string | null =>
    step.wrapperId != null && step.wrapperPath?.length
      ? step.wrapperPath.join(' / ')
      : null
  for (const step of trace) {
    const block = blockOf(step)
    const last = groups[groups.length - 1]
    if (last && last.block === block) last.steps.push(step)
    else groups.push({ block, steps: [step] })
  }
  return groups
}

const TraceStep = ({
  step,
  inner = false,
  onSelectNode
}: {
  step: TraceStep
  inner?: boolean
  onSelectNode: (
    nodeId: number,
    source?: { wrapperId?: number | null; sourceId?: number | null }
  ) => void
}) => {
  const [expanded, setExpanded] = useState(false)
  const innerTitle = inner
    ? step.nodeTitle.split(' / ').slice(1).join(' / ')
    : step.nodeTitle
  const select = () => {
    if (step.wrapperId != null || step.sourceId != null)
      onSelectNode(step.nodeId, { wrapperId: step.wrapperId, sourceId: step.sourceId })
    else onSelectNode(step.nodeId)
  }
  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label={`Select ${step.nodeTitle}`}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          select()
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
          <Typography fontWeight={inner ? 500 : 600}>{innerTitle}</Typography>
          <Chip size="small" label={step.state} />
          {step.durationMs !== undefined && (
            <Typography variant="caption">{step.durationMs} ms</Typography>
          )}
        </Stack>
        {step.error && <Alert severity="error">{step.error.message}</Alert>}
        {step.warnings?.map((warning) => (
          <Alert severity="warning" key={`${warning.code}-${warning.parameter}`}>
            {warning.parameter} was ignored for {warning.modelId} on {warning.providerKey}
            .
          </Alert>
        ))}
        {(expanded ? (step.outputs ?? []) : (step.outputs ?? []).slice(0, 1)).map(
          (output) => (
            <Stack key={output.slot} spacing={0.5}>
              <Typography variant="caption">{output.name}</Typography>
              <TraceValue value={output.value} />
              {output.truncated && (
                <Typography variant="caption">Output truncated at 64 KiB.</Typography>
              )}
            </Stack>
          )
        )}
        {(step.outputs?.length ?? 0) > 1 && (
          <Button
            size="small"
            onClick={(event) => {
              event.stopPropagation()
              setExpanded((value) => !value)
            }}
          >
            {expanded
              ? 'Show less'
              : `Show ${(step.outputs?.length ?? 0) - 1} more output${(step.outputs?.length ?? 0) - 1 === 1 ? '' : 's'}`}
          </Button>
        )}
        <Divider />
      </Stack>
    </Box>
  )
}
