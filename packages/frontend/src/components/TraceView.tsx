import type { RunState, ServerEventPayload } from '@haski/ta-lib'
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material'
import { type MouseEvent, type SyntheticEvent, useEffect, useRef, useState } from 'react'

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
  const [filter, setFilter] = useState<TraceFilter>('all')
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set<number>())
  const [touched, setTouched] = useState<ReadonlySet<number>>(new Set<number>())
  const stepRefs = useRef(new Map<number, HTMLDivElement>())

  // A new run clears the trace and rotates the run id: drop the previous run's
  // filter and expansion state so nothing stale leaks across attempts. A single
  // trace step may change identity in place (nodeExecutionChanged updates by
  // nodeId in useServerEvents), so only reset on the empty-to-non-empty edge.
  const traceIsEmpty = trace.length === 0
  const wasEmpty = useRef(true)
  useEffect(() => {
    if (traceIsEmpty) wasEmpty.current = true
    else if (wasEmpty.current) {
      wasEmpty.current = false
      setFilter('all')
      setExpanded(new Set<number>())
      setTouched(new Set<number>())
      stepRefs.current.clear()
    }
  }, [traceIsEmpty])

  const errorCount = trace.filter(isErrorStep).length
  const warningCount = trace.filter(isWarningStep).length
  const totalDurationMs = trace.reduce((sum, step) => sum + (step.durationMs ?? 0), 0)
  const showTotalDuration = trace.some((step) => step.durationMs !== undefined)

  // Failed steps auto-expand unless the user already toggled that step; every
  // other step stays collapsed by default. Prune ids that left the trace.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev)
      let changed = false
      for (const step of trace) {
        if (isErrorStep(step) && !touched.has(step.nodeId) && !next.has(step.nodeId)) {
          next.add(step.nodeId)
          changed = true
        }
      }
      for (const id of next) {
        if (!trace.some((step) => step.nodeId === id)) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [trace, touched])

  const filtered =
    filter === 'errors'
      ? trace.filter(isErrorStep)
      : filter === 'warnings'
        ? trace.filter(isWarningStep)
        : trace
  const groups = groupTraceByBlock(filtered)
  const visibleIds = filtered.map((step) => step.nodeId)

  const toggleStep = (nodeId: number, open: boolean): void => {
    setTouched((prev) => new Set(prev).add(nodeId))
    setExpanded((prev) => {
      const next = new Set(prev)
      if (open) next.add(nodeId)
      else next.delete(nodeId)
      return next
    })
  }

  const expandAll = (): void => {
    setTouched((prev) => new Set([...prev, ...visibleIds]))
    setExpanded((prev) => new Set([...prev, ...visibleIds]))
  }

  const collapseAll = (): void => {
    setTouched((prev) => new Set([...prev, ...visibleIds]))
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const id of visibleIds) next.delete(id)
      return next
    })
  }

  const jumpToFirstError = (): void => {
    const first = trace.find(isErrorStep)
    if (!first) return
    // The failing step may be hidden by the warnings filter; fall back to All.
    if (!filtered.some((step) => step.nodeId === first.nodeId)) setFilter('all')
    setTouched((prev) => new Set(prev).add(first.nodeId))
    setExpanded((prev) => new Set(prev).add(first.nodeId))
    const target = stepRefs.current.get(first.nodeId)
    if (target && typeof target.scrollIntoView === 'function')
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const registerStepRef =
    (nodeId: number) =>
    (element: HTMLDivElement | null): void => {
      if (element) stepRefs.current.set(nodeId, element)
      else stepRefs.current.delete(nodeId)
    }

  return (
    <Stack spacing={2} padding={2} aria-label="Run trace">
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h6">Run: {runState ?? 'idle'}</Typography>
        {(runState === 'queued' || runState === 'running') && (
          <Button color="warning" onClick={onCancel}>
            {runState === 'queued' ? 'Cancel (waiting to start…)' : 'Cancel'}
          </Button>
        )}
      </Stack>
      {trace.length > 0 && (
        <Typography color="text.secondary" variant="caption">
          {trace.length} step{trace.length === 1 ? '' : 's'} · {errorCount} error
          {errorCount === 1 ? '' : 's'} · {warningCount} warning
          {warningCount === 1 ? '' : 's'}
          {showTotalDuration ? ` · ${formatTotalDuration(totalDurationMs)} total` : ''}
        </Typography>
      )}
      {trace.length > 0 && (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ flexWrap: 'wrap', rowGap: 1 }}
        >
          <ToggleButtonGroup
            exclusive
            size="small"
            value={filter}
            onChange={(_event: MouseEvent<HTMLElement>, value: TraceFilter | null) => {
              if (value !== null) setFilter(value)
            }}
            aria-label="Filter trace"
          >
            <ToggleButton value="all">All ({trace.length})</ToggleButton>
            <ToggleButton value="errors">Errors ({errorCount})</ToggleButton>
            <ToggleButton value="warnings">Warnings ({warningCount})</ToggleButton>
          </ToggleButtonGroup>
          <Button size="small" onClick={expandAll}>
            Expand all
          </Button>
          <Button size="small" onClick={collapseAll}>
            Collapse all
          </Button>
          {errorCount > 0 && (
            <Button size="small" onClick={jumpToFirstError}>
              Jump to first error
            </Button>
          )}
        </Stack>
      )}
      {trace.length === 0 && (
        <Typography color="text.secondary">Run workflow to see trace.</Typography>
      )}
      {trace.length > 0 && filtered.length === 0 && (
        <Typography color="text.secondary">
          {filter === 'errors' ? 'No errors in this run.' : 'No warnings in this run.'}
        </Typography>
      )}
      {groups.map((group, index) =>
        group.block === null ? (
          group.steps.map((step) => (
            <Box key={`${step.nodeId}-${index}`} ref={registerStepRef(step.nodeId)}>
              <TraceStepItem
                step={step}
                expanded={expanded.has(step.nodeId)}
                onToggle={(open) => toggleStep(step.nodeId, open)}
                onSelectNode={onSelectNode}
              />
            </Box>
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
              <Box key={`${step.nodeId}-${index}`} ref={registerStepRef(step.nodeId)}>
                <TraceStepItem
                  step={step}
                  inner
                  expanded={expanded.has(step.nodeId)}
                  onToggle={(open) => toggleStep(step.nodeId, open)}
                  onSelectNode={onSelectNode}
                />
              </Box>
            ))}
          </Box>
        )
      )}
    </Stack>
  )
}

type TraceStep = ServerEventPayload['nodeExecutionChanged']

type TraceFilter = 'all' | 'errors' | 'warnings'

const isErrorStep = (step: TraceStep): boolean =>
  step.state === 'failed' || step.error != null

const isWarningStep = (step: TraceStep): boolean => (step.warnings?.length ?? 0) > 0

const formatTotalDuration = (totalMs: number): string =>
  totalMs >= 1000 ? `${(totalMs / 1000).toFixed(1)} s` : `${totalMs} ms`

const chipColor = (
  state: TraceStep['state']
): 'default' | 'error' | 'success' | 'info' | 'warning' => {
  switch (state) {
    case 'failed':
      return 'error'
    case 'completed':
      return 'success'
    case 'running':
      return 'info'
    case 'cancelled':
      return 'warning'
    default:
      return 'default'
  }
}

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

const TraceStepItem = ({
  step,
  inner = false,
  expanded,
  onToggle,
  onSelectNode
}: {
  step: TraceStep
  inner?: boolean
  expanded: boolean
  onToggle: (open: boolean) => void
  onSelectNode: (
    nodeId: number,
    source?: { wrapperId?: number | null; sourceId?: number | null }
  ) => void
}) => {
  const innerTitle = inner
    ? step.nodeTitle.split(' / ').slice(1).join(' / ')
    : step.nodeTitle
  const warningCount = step.warnings?.length ?? 0
  const outputCount = step.outputs?.length ?? 0
  const select = () => {
    if (step.wrapperId != null || step.sourceId != null)
      onSelectNode(step.nodeId, { wrapperId: step.wrapperId, sourceId: step.sourceId })
    else onSelectNode(step.nodeId)
  }
  return (
    <Accordion
      expanded={expanded}
      onChange={(_: SyntheticEvent, open: boolean) => onToggle(open)}
      disableGutters
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        aria-label={`Toggle ${step.nodeTitle}`}
      >
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ flexGrow: 1, minWidth: 0, paddingRight: 1 }}
        >
          <Typography
            fontWeight={inner ? 500 : 600}
            noWrap
            title={innerTitle}
            sx={{ minWidth: 0 }}
          >
            {innerTitle}
          </Typography>
          <Chip size="small" label={step.state} color={chipColor(step.state)} />
          {step.durationMs !== undefined && (
            <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
              {step.durationMs} ms
            </Typography>
          )}
          {!expanded && step.error && (
            <Typography
              variant="caption"
              color="error"
              noWrap
              data-testid={`trace-step-${step.nodeId}-error-snippet`}
              title={step.error.message}
            >
              {step.error.message}
            </Typography>
          )}
          {!expanded && !step.error && warningCount > 0 && (
            <Typography
              variant="caption"
              color="warning.main"
              sx={{ whiteSpace: 'nowrap' }}
            >
              {warningCount} warning{warningCount === 1 ? '' : 's'}
            </Typography>
          )}
          {!expanded && outputCount > 0 && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ whiteSpace: 'nowrap' }}
            >
              {outputCount} output{outputCount === 1 ? '' : 's'}
            </Typography>
          )}
        </Stack>
      </AccordionSummary>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1 }}>
        <Button
          size="small"
          startIcon={<CenterFocusStrongIcon fontSize="small" />}
          aria-label={`Select ${step.nodeTitle}`}
          onClick={select}
        >
          Locate on canvas
        </Button>
      </Box>
      <AccordionDetails sx={{ display: expanded ? undefined : 'none' }}>
        {expanded && (
          <Stack spacing={1}>
            {step.error && <Alert severity="error">{step.error.message}</Alert>}
            {step.warnings?.map((warning) => (
              <Alert severity="warning" key={`${warning.code}-${warning.parameter}`}>
                {warning.parameter} was ignored for {warning.modelId} on{' '}
                {warning.providerKey}.
              </Alert>
            ))}
            {(step.outputs ?? []).map((output) => (
              <Stack key={output.slot} spacing={0.5}>
                <Typography variant="caption">{output.name}</Typography>
                <TraceValue value={output.value} />
                {output.truncated && (
                  <Typography variant="caption">Output truncated at 64 KiB.</Typography>
                )}
              </Stack>
            ))}
            {!step.error && warningCount === 0 && outputCount === 0 && (
              <Typography variant="caption" color="text.secondary">
                No outputs.
              </Typography>
            )}
          </Stack>
        )}
      </AccordionDetails>
    </Accordion>
  )
}
