import type { ServerEventPayload } from '@haski/ta-lib'
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong'
import {
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

import type { PreviewMessages } from '@/i18n/preview'

interface MyThemeComponentProps {
  color?: 'primary' | 'secondary'
}

/** A score at or above this value counts as passed (SPEC-0007/FR-004). */
export const PASS_THRESHOLD = 60

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

/**
 * One output as the preview and the Submissions inbox show it. A stored run has no
 * run correlation, so those fields are not part of the card's contract.
 */
export type ResultOutput = Omit<
  ServerEventPayload['outputSet'],
  'runId' | 'workflowId' | 'timestamp'
>

/**
 * One result on its own card: the output node's label as title, the value as body.
 * The locate button is an editor affordance and only renders when a handler is given;
 * students see the card without it.
 *
 * A `review` output is the tutor's cue (SPEC-0020/FR-002): flagged runs get a warning
 * border and chip, clear ones a neutral chip, and both carry the reminder that a
 * recommendation is not an approval.
 */
export const ResultCard = ({
  output,
  messages,
  onLocate
}: {
  output: ResultOutput
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
  const flagged = output.type === 'review' && output.verdict === 'flagged'
  const clear = output.type === 'review' && output.verdict === 'clear'

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
      case 'review': {
        const reason = String(output.value ?? '').trim()
        const text = reason || (flagged ? messages.reviewNoReason : '')
        return (
          <Stack spacing={1}>
            {text && (
              <Typography
                variant="body1"
                sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
              >
                {text}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              {messages.reviewCaption}
            </Typography>
          </Stack>
        )
      }
    }
  })()

  return (
    <Card
      variant="outlined"
      component="article"
      aria-label={title}
      sx={flagged ? { borderColor: 'warning.main', borderWidth: 2 } : undefined}
    >
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
            {flagged && (
              <Chip size="small" color="warning" label={messages.needsReview} />
            )}
            {clear && <Chip size="small" label={messages.noIssueFound} />}
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
