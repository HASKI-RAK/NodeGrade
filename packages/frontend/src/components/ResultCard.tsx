import type {
  OutputAudience,
  OutputTone,
  ReportEntry,
  ServerEventPayload
} from '@haski/ta-lib'
import {
  DEFAULT_PASS_MARK,
  isChecklist,
  parseReport,
  reportHeadline,
  toneFor,
  toneKey
} from '@haski/ta-lib'
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined'
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong'
import CheckIcon from '@mui/icons-material/Check'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CloseIcon from '@mui/icons-material/Close'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined'
import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Stack,
  Tooltip,
  Typography
} from '@mui/material'
import LinearProgress, { linearProgressClasses } from '@mui/material/LinearProgress'
import { styled } from '@mui/material/styles'
import type { ReactElement } from 'react'

import type { PreviewMessages } from '@/i18n/preview'

/** A score at or above this value counts as passed unless the node says otherwise. */
export const PASS_THRESHOLD = DEFAULT_PASS_MARK

type ChipColor = 'success' | 'warning' | 'error' | 'info' | 'default'

const chipColor = (tone: OutputTone | undefined): ChipColor =>
  tone === undefined || tone === 'neutral' ? 'default' : tone

const toneIcon = (tone: OutputTone | undefined): ReactElement => {
  switch (tone) {
    case 'success':
      return <CheckCircleOutlineIcon />
    case 'error':
      return <CancelOutlinedIcon />
    case 'warning':
      return <ErrorOutlineIcon />
    case 'info':
      return <InfoOutlinedIcon />
    default:
      return <HelpOutlineIcon />
  }
}

/** `TOO_VAGUE_OR_IRRELEVANT` reads as "Too vague or irrelevant"; prose stays as it is. */
const prettify = (token: string): string => {
  const trimmed = token.trim()
  if (!/^[A-Z0-9_ /-]+$/.test(trimmed) || !/[A-Z]/.test(trimmed)) return trimmed
  const words = trimmed.replace(/_/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const clampPercent = (value: number, max: number): number =>
  Math.max(0, Math.min(100, (value / max) * 100))

const BorderLinearProgress = styled(LinearProgress)<{ barcolor: string }>(
  ({ theme, barcolor }) => ({
    height: 10,
    borderRadius: 5,
    [`&.${linearProgressClasses.colorPrimary}`]: {
      backgroundColor: theme.palette.grey[theme.palette.mode === 'light' ? 200 : 800]
    },
    [`& .${linearProgressClasses.bar}`]: {
      borderRadius: 5,
      backgroundColor: barcolor
    }
  })
)

/** Keys the report card promotes out of the definition list. */
const EVIDENCE_KEYS = new Set(['EVIDENCE', 'QUOTE'])
const REASON_KEYS = new Set(['REASON', 'REASONING', 'EXPLANATION'])
const CALLOUT_KEYS = new Set([
  'NEXT_STEP',
  'NEXT_STEPS',
  'GAP',
  'HINT',
  'SUGGESTION',
  'REVISION',
  'TIP'
])

/**
 * One output as the preview and the Submissions inbox show it. A stored run has no
 * run correlation, so those fields are not part of the card's contract.
 */
export type ResultOutput = Omit<
  ServerEventPayload['outputSet'],
  'runId' | 'workflowId' | 'timestamp'
>

const Prose = ({ text }: { text: string }) => (
  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
    {text}
  </Typography>
)

const Quote = ({ text }: { text: string }) => (
  <Typography
    component="blockquote"
    variant="body1"
    sx={{
      m: 0,
      pl: 1.5,
      borderLeft: 3,
      borderColor: 'divider',
      fontStyle: 'italic',
      color: 'text.secondary',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere'
    }}
  >
    {text}
  </Typography>
)

const Callout = ({ label, text }: { label: string; text: string }) => (
  <Box
    sx={{
      p: 1.5,
      borderRadius: 1,
      bgcolor: 'action.hover',
      borderLeft: 3,
      borderColor: 'info.main'
    }}
  >
    <Typography variant="overline" component="p" sx={{ lineHeight: 1.6 }}>
      {label}
    </Typography>
    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {text}
    </Typography>
  </Box>
)

const Row = ({ label, text }: { label: string; text: string }) => (
  <Box>
    <Typography variant="caption" color="text.secondary" component="p">
      {label}
    </Typography>
    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {text}
    </Typography>
  </Box>
)

const ReportBody = ({
  entries,
  prose,
  messages
}: {
  entries: ReportEntry[]
  prose: string[]
  messages: PreviewMessages
}) => {
  if (entries.length === 0 && prose.length === 0)
    return <Typography color="text.secondary">{messages.noValue}</Typography>
  return (
    <Stack spacing={1.25}>
      {entries.map((entry, index) => {
        const key = toneKey(entry.key)
        const label = prettify(entry.key)
        if (EVIDENCE_KEYS.has(key))
          return <Quote key={`${index}-${key}`} text={entry.value} />
        if (REASON_KEYS.has(key))
          return <Prose key={`${index}-${key}`} text={entry.value} />
        if (CALLOUT_KEYS.has(key))
          return (
            <Callout
              key={`${index}-${key}`}
              label={key.startsWith('NEXT') ? messages.nextStep : label}
              text={entry.value}
            />
          )
        return <Row key={`${index}-${key}`} label={label} text={entry.value} />
      })}
      {prose.length > 0 && <Prose text={prose.join('\n')} />}
    </Stack>
  )
}

/**
 * One result on its own card: the output node's label as title, the value as body,
 * the node's `detail` as a secondary line. The locate button is an editor affordance
 * and only renders when a handler is given; students see the card without it.
 *
 * Every display type is a different body (SPEC-0007/FR-004): prose, a score bar with a
 * pass chip, classification chips, a verdict chip, a parsed `KEY: value` report, a
 * ticked checklist, or a measure that is evidence and says so. A `review` output is
 * the tutor's cue (SPEC-0020/FR-002): flagged runs get a warning border and chip,
 * clear ones a neutral chip, and both carry the reminder that a recommendation is not
 * an approval.
 *
 * `viewer` decides whether an educator-only card announces itself; hiding it from
 * students is the results list's job.
 */
export const ResultCard = ({
  output,
  messages,
  onLocate,
  viewer = 'educator'
}: {
  output: ResultOutput
  messages: PreviewMessages
  onLocate?: () => void
  viewer?: 'educator' | 'student'
}) => {
  const title =
    output.type === 'classifications'
      ? output.label || messages.classificationsHeading
      : output.label
  const flagged = output.type === 'review' && output.verdict === 'flagged'
  const clear = output.type === 'review' && output.verdict === 'clear'
  const audience: OutputAudience = output.audience ?? 'everyone'
  const educatorOnly = audience === 'educator' && viewer === 'educator'

  const headerChips: ReactElement[] = []
  let accent: OutputTone | undefined

  const body = (() => {
    switch (output.type) {
      case 'text': {
        const text = String(output.value ?? '').trim()
        return text ? (
          <Prose text={text} />
        ) : (
          <Typography color="text.secondary">{messages.noValue}</Typography>
        )
      }
      case 'score': {
        if (typeof output.value !== 'number') return null
        const max = output.max && output.max > 0 ? output.max : 100
        const passMark = output.passMark ?? DEFAULT_PASS_MARK
        const passed = passMark > 0 && output.value >= passMark
        const failed = passMark > 0 && output.value < passMark
        if (passed)
          headerChips.push(
            <Chip key="passed" size="small" color="success" label={messages.passed} />
          )
        if (failed)
          headerChips.push(
            <Chip
              key="not-passed"
              size="small"
              variant="outlined"
              label={messages.notPassed}
            />
          )
        return (
          <Stack spacing={1}>
            <Typography variant="h4" component="p" fontWeight={600}>
              {max === 100 ? output.value : messages.pointsOf(output.value, max)}
            </Typography>
            {output.value >= 0 && output.value <= max && (
              <BorderLinearProgress
                variant="determinate"
                value={clampPercent(output.value, max)}
                barcolor={passed ? '#388E3C' : '#308fe8'}
                aria-label={title}
              />
            )}
          </Stack>
        )
      }
      case 'measure': {
        if (typeof output.value !== 'number') return null
        const max = output.max && output.max > 0 ? output.max : 1
        return (
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="baseline">
              <Typography variant="h4" component="p" fontWeight={600}>
                {output.value}
              </Typography>
              {max !== 1 && (
                <Typography variant="body2" color="text.secondary">
                  / {max}
                </Typography>
              )}
            </Stack>
            <BorderLinearProgress
              variant="determinate"
              value={clampPercent(output.value, max)}
              barcolor="#7e8ba3"
              aria-label={title}
            />
            <Typography variant="caption" color="text.secondary">
              {messages.measureCaption}
            </Typography>
          </Stack>
        )
      }
      case 'verdict': {
        const value = output.value
        const empty =
          value === undefined ||
          value === null ||
          (typeof value === 'string' && value.trim() === '')
        if (empty)
          return <Typography color="text.secondary">{messages.noValue}</Typography>
        const label =
          typeof value === 'boolean'
            ? value
              ? messages.yes
              : messages.no
            : prettify(String(value))
        const tone =
          toneFor(value, output.toneMap) ??
          (typeof value === 'boolean' ? (value ? 'success' : 'error') : undefined)
        accent = tone
        return (
          <Chip
            icon={toneIcon(tone)}
            color={chipColor(tone)}
            label={label}
            sx={{
              fontWeight: 600,
              fontSize: '1rem',
              height: 36,
              px: 0.5,
              alignSelf: 'flex-start'
            }}
          />
        )
      }
      case 'report': {
        const report = parseReport(output.value)
        const headline = reportHeadline(report, output.statusKey)
        const tone = headline ? toneFor(headline.value, output.toneMap) : undefined
        accent = tone
        if (headline && headline.value)
          headerChips.push(
            <Chip
              key="headline"
              size="small"
              icon={toneIcon(tone)}
              color={chipColor(tone)}
              label={prettify(headline.value)}
              sx={{ fontWeight: 600 }}
            />
          )
        if (report.points !== undefined) {
          const max = output.max && output.max > 0 ? output.max : undefined
          const pointsTone: OutputTone | undefined =
            max === undefined
              ? undefined
              : report.points >= max
                ? 'success'
                : report.points > 0
                  ? 'warning'
                  : 'error'
          headerChips.push(
            <Chip
              key="points"
              size="small"
              color={chipColor(pointsTone)}
              variant={pointsTone ? 'filled' : 'outlined'}
              label={max ? messages.pointsOf(report.points, max) : String(report.points)}
              sx={{ fontWeight: 600 }}
            />
          )
          if (!accent) accent = pointsTone
        }
        return (
          <ReportBody
            entries={report.entries.filter((entry) => entry !== headline)}
            prose={report.prose}
            messages={messages}
          />
        )
      }
      case 'checklist': {
        if (isChecklist(output.value)) {
          if (output.value.length === 0)
            return <Typography color="text.secondary">{messages.noValue}</Typography>
          return (
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {output.value.map((item, index) => (
                <Chip
                  key={`${index}-${item.label}`}
                  label={item.label}
                  icon={item.ok ? <CheckIcon /> : <CloseIcon />}
                  color={item.ok ? 'success' : 'default'}
                  variant={item.ok ? 'filled' : 'outlined'}
                  sx={item.ok ? undefined : { textDecoration: 'line-through' }}
                />
              ))}
            </Stack>
          )
        }
        if (!Array.isArray(output.value)) return null
        return <Prose text={output.value.map(String).join(', ')} />
      }
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
              .map((classification, index) => {
                const tone = toneFor(classification, output.toneMap)
                return (
                  <Chip
                    key={`${index}-${classification}`}
                    label={classification}
                    color={chipColor(tone)}
                    variant={tone && tone !== 'neutral' ? 'filled' : 'outlined'}
                  />
                )
              })}
          </Stack>
        )
      case 'review': {
        const reason = String(output.value ?? '').trim()
        const text = reason || (flagged ? messages.reviewNoReason : '')
        return (
          <Stack spacing={1}>
            {text && <Prose text={text} />}
            <Typography variant="caption" color="text.secondary">
              {messages.reviewCaption}
            </Typography>
          </Stack>
        )
      }
    }
  })()

  const detail = String(output.detail ?? '').trim()
  const accentColor = accent && accent !== 'neutral' ? `${accent}.main` : undefined

  return (
    <Card
      variant="outlined"
      component="article"
      aria-label={title}
      sx={{
        ...(flagged ? { borderColor: 'warning.main', borderWidth: 2 } : {}),
        ...(accentColor ? { borderLeft: 4, borderLeftColor: accentColor } : {})
      }}
    >
      <CardContent sx={{ '&:last-child': { paddingBottom: 2 } }}>
        <Stack spacing={1}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            useFlexGap
            sx={{ minWidth: 0, flexWrap: 'wrap' }}
          >
            <Typography
              variant="subtitle1"
              component="h3"
              fontWeight={600}
              sx={{ flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' }}
            >
              {title}
            </Typography>
            {headerChips}
            {flagged && (
              <Chip size="small" color="warning" label={messages.needsReview} />
            )}
            {clear && <Chip size="small" label={messages.noIssueFound} />}
            {educatorOnly && (
              <Chip
                size="small"
                variant="outlined"
                icon={<SchoolOutlinedIcon />}
                label={messages.educatorOnly}
              />
            )}
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
          {detail && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
            >
              {detail}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
