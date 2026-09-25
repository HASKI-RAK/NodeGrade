import {
  Box,
  Card,
  CardActions,
  CardContent,
  Chip,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography
} from '@mui/material'
import type { ReactNode } from 'react'

type PreviewNode = { id: number; type: string; title?: string }

/**
 * Method phrases highlighted inside workflow descriptions on the card.
 * Longest first so "embedding similarity to a reference" wins over
 * "embedding similarity". Matching is case-insensitive; the original
 * casing is preserved in the output.
 */
const METHOD_TERMS = [
  'embedding similarity to a reference',
  'deterministic point aggregation',
  'expected-words check',
  'conceptual assessment',
  'rubric-based scoring',
  'deterministic aggregation',
  'drafts feedback',
  'review stage',
  'criterion-based',
  'criterion reports',
  'cosine similarity',
  'sentence-transformer',
  'expected words',
  'embedding similarity',
  'keyword search',
  'feedback policy',
  'classification',
  'classifies',
  'extract-number',
  'math nodes',
  'LLM judgment',
  'LLM grader',
  'LLM classification',
  'LLM feedback',
  'LLM review',
  'formative feedback',
  'rubric criteria',
  'rubric'
]

const METHOD_PATTERN = new RegExp(
  `(${METHOD_TERMS.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'gi'
)

export const TemplateDescription = ({ text }: { text: string | null }) => {
  if (!text) return null
  const parts = text.split(METHOD_PATTERN)
  return (
    <Typography sx={{ whiteSpace: 'pre-line' }}>
      {parts.map((part, index) =>
        index % 2 === 1 ? <strong key={index}>{part}</strong> : part
      )}
    </Typography>
  )
}

export const TemplateTags = ({ tags }: { tags: string[] }) => {
  if (tags.length === 0) return null
  return (
    <Stack direction="row" gap={0.5} mt={1} flexWrap="wrap" aria-label="Template methods">
      {tags.map((tag) => (
        <Chip key={tag} label={tag} size="small" variant="outlined" />
      ))}
    </Stack>
  )
}

const graphStructure = (content: string) => {
  const parsed = JSON.parse(content) as {
    nodes?: PreviewNode[]
    links?: unknown[]
  }
  return {
    nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
    linkCount: Array.isArray(parsed.links) ? parsed.links.length : 0
  }
}

/** The node list of a template graph, for the structure preview. */
export const TemplateStructure = ({ content }: { content: string }) => {
  const structure = graphStructure(content)
  return (
    <Box aria-label="Template structure">
      <Typography color="text.secondary">
        {structure.nodes.length} nodes · {structure.linkCount} connections
      </Typography>
      <List dense>
        {structure.nodes.map((node) => (
          <ListItem key={node.id} disableGutters>
            <ListItemText
              primary={node.title || node.type}
              secondary={`${node.type} · node ${node.id}`}
            />
          </ListItem>
        ))}
      </List>
    </Box>
  )
}

/** A template as a card: labels, name, highlighted description, tags and actions. */
export const TemplateCard = ({
  name,
  description,
  tags,
  labels,
  footer,
  actions
}: {
  name: string
  description: string | null
  tags: string[]
  labels?: ReactNode
  footer?: ReactNode
  actions: ReactNode
}) => (
  <Card>
    <CardContent>
      {labels && (
        <Stack direction="row" gap={1} mb={1} flexWrap="wrap">
          {labels}
        </Stack>
      )}
      <Typography variant="h6">{name}</Typography>
      <TemplateDescription text={description} />
      <TemplateTags tags={tags} />
      {footer}
    </CardContent>
    <CardActions>{actions}</CardActions>
  </Card>
)
