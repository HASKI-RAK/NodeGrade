import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Typography
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import {
  api,
  type TemplateKind,
  type TemplateRevision,
  type WorkflowTemplate
} from '@/api/http'
import { useWorkspaceSession } from '@/hooks/useWorkspaceSession'

type PreviewNode = { id: number; type: string; title?: string }

const graphStructure = (revision: TemplateRevision) => {
  const parsed = JSON.parse(revision.content) as {
    nodes?: PreviewNode[]
    links?: unknown[]
  }
  return {
    nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
    linkCount: Array.isArray(parsed.links) ? parsed.links.length : 0
  }
}

export const TemplatesPage = () => {
  const { session } = useWorkspaceSession()
  const [templates, setTemplates] = useState<WorkflowTemplate[] | null>(null)
  const [kind, setKind] = useState<'ALL' | TemplateKind>('ALL')
  const [preview, setPreview] = useState<{
    template: WorkflowTemplate
    revision: TemplateRevision
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const returnTo = search.get('returnTo')

  useEffect(() => {
    void api.templates().then(setTemplates)
  }, [])

  const visibleTemplates = useMemo(
    () => templates?.filter((template) => kind === 'ALL' || template.kind === kind),
    [kind, templates]
  )

  if (!templates)
    return (
      <Box p={4}>
        <CircularProgress />
      </Box>
    )

  return (
    <Box p={4}>
      <Button component={Link} to={returnTo?.startsWith('/') ? returnTo : '/'}>
        Back
      </Button>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ sm: 'center' }}
        justifyContent="space-between"
        gap={2}
        mb={2}
      >
        <Typography variant="h4">Templates</Typography>
        <FormControl size="small" sx={{ minWidth: 190 }}>
          <InputLabel id="template-kind-label">Template type</InputLabel>
          <Select
            labelId="template-kind-label"
            label="Template type"
            value={kind}
            onChange={(event) => setKind(event.target.value as 'ALL' | TemplateKind)}
          >
            <MenuItem value="ALL">All types</MenuItem>
            <MenuItem value="WORKFLOW">Workflows</MenuItem>
            <MenuItem value="BLOCK">Blocks</MenuItem>
          </Select>
        </FormControl>
      </Stack>
      <Grid container spacing={2}>
        {visibleTemplates?.map((template) => (
          <Grid key={template.id} size={{ xs: 12, md: 6 }}>
            <Card sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <CardContent sx={{ flexGrow: 1 }}>
                <Stack direction="row" gap={1} mb={1} flexWrap="wrap">
                  <Chip label={template.kind === 'WORKFLOW' ? 'Workflow' : 'Block'} />
                  <Chip label={template.category ?? 'Uncategorized'} variant="outlined" />
                </Stack>
                <Typography variant="h6" gutterBottom>
                  {template.name}
                </Typography>
                {template.description && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      textWrap: 'balance',
                      display: '-webkit-box',
                      WebkitLineClamp: 5,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}
                  >
                    {template.description}
                  </Typography>
                )}
              </CardContent>
              <CardActions sx={{ mt: 'auto', pt: 0 }}>
                <Button
                  onClick={async () => {
                    setPreviewLoading(true)
                    try {
                      setPreview(await api.template(template.slug))
                    } finally {
                      setPreviewLoading(false)
                    }
                  }}
                >
                  Preview structure
                </Button>
                <Button
                  disabled={!session || template.kind !== 'WORKFLOW'}
                  onClick={async () => {
                    if (!session) return
                    const workflow = await api.fromTemplate(session.token, template.slug)
                    navigate(`/editor/${workflow.id}`)
                  }}
                >
                  Use template
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
      {visibleTemplates?.length === 0 && (
        <Typography color="text.secondary">No templates match this type.</Typography>
      )}
      <Dialog open={previewLoading || preview !== null} onClose={() => setPreview(null)}>
        <DialogTitle>{preview?.template.name ?? 'Loading template…'}</DialogTitle>
        <DialogContent sx={{ minWidth: { sm: 480 } }}>
          {previewLoading && <CircularProgress />}
          {preview && !previewLoading && (
            <TemplateStructure revision={preview.revision} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreview(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

const TemplateStructure = ({ revision }: { revision: TemplateRevision }) => {
  const structure = graphStructure(revision)
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
