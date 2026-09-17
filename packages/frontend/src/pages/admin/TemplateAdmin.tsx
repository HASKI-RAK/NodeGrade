import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material'
import { useCallback, useEffect, useState } from 'react'

import { apiRequest, type TemplateKind } from '@/api/http'

type ManagedTemplate = {
  id: string
  slug: string
  kind: TemplateKind
  name: string
  description: string | null
  category: string | null
  tags: string[]
  published: boolean
  currentRevision: number
}

const csrf = () =>
  document.cookie
    .split('; ')
    .find((part) => part.startsWith('ng_admin_csrf='))
    ?.split('=')
    .slice(1)
    .join('=')

const mutate = <T,>(path: string, method: 'POST' | 'DELETE', body?: unknown) =>
  apiRequest<T>(path, {
    method,
    headers: { 'X-CSRF-Token': decodeURIComponent(csrf() ?? '') },
    ...(body === undefined ? {} : { body })
  })

const EMPTY_GRAPH = JSON.stringify({ nodes: [], links: [] }, null, 2)

export const TemplateAdmin = () => {
  const [templates, setTemplates] = useState<ManagedTemplate[]>([])
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [kind, setKind] = useState<TemplateKind>('WORKFLOW')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [content, setContent] = useState(EMPTY_GRAPH)
  const [revisionFor, setRevisionFor] = useState<ManagedTemplate | null>(null)
  const [revisionName, setRevisionName] = useState('')
  const [revisionContent, setRevisionContent] = useState(EMPTY_GRAPH)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const { data } = await apiRequest<{ templates: ManagedTemplate[] }>(
      '/admin/templates'
    )
    setTemplates(data.templates)
  }, [])

  useEffect(() => {
    void refresh().catch((loadError: unknown) =>
      setError(
        loadError instanceof Error ? loadError.message : 'Template loading failed.'
      )
    )
  }, [refresh])

  const run = async (action: () => Promise<void>, success: string) => {
    setError(null)
    try {
      await action()
      setMessage(success)
      await refresh()
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : 'Template action failed.'
      )
    }
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Template administration</Typography>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Create template</Typography>
            <TextField
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <TextField
              label="Slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
            />
            <TextField
              select
              label="Type"
              value={kind}
              onChange={(event) => setKind(event.target.value as TemplateKind)}
            >
              <MenuItem value="WORKFLOW">Workflow</MenuItem>
              <MenuItem value="BLOCK">Block</MenuItem>
            </TextField>
            <TextField
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <TextField
              label="Category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
            <TextField
              label="Content JSON"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              multiline
              minRows={5}
              inputProps={{ spellCheck: false }}
            />
          </Stack>
        </CardContent>
        <CardActions>
          <Button
            variant="contained"
            disabled={!name.trim() || !slug.trim() || !content.trim()}
            onClick={() =>
              void run(async () => {
                await mutate('/admin/templates', 'POST', {
                  name: name.trim(),
                  slug: slug.trim(),
                  kind,
                  description: description.trim() || undefined,
                  category: category.trim() || undefined,
                  content,
                  published: false
                })
                setName('')
                setSlug('')
              }, 'Template created.')
            }
          >
            Create template
          </Button>
        </CardActions>
      </Card>

      {message && <Typography color="success.main">{message}</Typography>}
      {error && <Typography color="error">{error}</Typography>}

      <Stack spacing={2}>
        {templates.map((template) => (
          <Card key={template.id}>
            <CardContent>
              <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                <Typography variant="h6">{template.name}</Typography>
                <Chip label={template.kind === 'WORKFLOW' ? 'Workflow' : 'Block'} />
                <Chip
                  color={template.published ? 'success' : 'default'}
                  label={template.published ? 'Published' : 'Unpublished'}
                />
              </Stack>
              <Typography color="text.secondary">
                {template.slug} · revision {template.currentRevision} ·{' '}
                {template.category ?? 'Uncategorized'}
              </Typography>
              {template.description && <Typography>{template.description}</Typography>}
            </CardContent>
            <CardActions>
              <Button
                aria-label={`${template.published ? 'Unpublish' : 'Publish'} ${template.name}`}
                onClick={() =>
                  void run(
                    async () => {
                      await mutate(`/admin/templates/${template.id}/published`, 'POST', {
                        published: !template.published
                      })
                    },
                    template.published ? 'Template unpublished.' : 'Template published.'
                  )
                }
              >
                {template.published ? 'Unpublish' : 'Publish'}
              </Button>
              <Button
                aria-label={`Add revision to ${template.name}`}
                onClick={() => {
                  setRevisionFor(template)
                  setRevisionName(template.name)
                }}
              >
                Add revision
              </Button>
              <Button
                color="error"
                aria-label={`Delete ${template.name}`}
                onClick={() => {
                  if (!window.confirm(`Delete template “${template.name}”?`)) return
                  void run(async () => {
                    await mutate(`/admin/templates/${template.id}`, 'DELETE')
                  }, 'Template deleted.')
                }}
              >
                Delete
              </Button>
            </CardActions>
            {revisionFor?.id === template.id && (
              <Box p={2} pt={0} aria-label={`New revision for ${template.name}`}>
                <Stack spacing={2}>
                  <Typography variant="subtitle1">New revision</Typography>
                  <TextField
                    label="Revision name"
                    value={revisionName}
                    onChange={(event) => setRevisionName(event.target.value)}
                  />
                  <TextField
                    label="Revision content JSON"
                    value={revisionContent}
                    onChange={(event) => setRevisionContent(event.target.value)}
                    multiline
                    minRows={5}
                    inputProps={{ spellCheck: false }}
                  />
                  <Stack direction="row" gap={1}>
                    <Button
                      variant="contained"
                      disabled={!revisionName.trim() || !revisionContent.trim()}
                      onClick={() =>
                        void run(async () => {
                          await mutate(
                            `/admin/templates/${template.id}/revisions`,
                            'POST',
                            {
                              name: revisionName.trim(),
                              description: template.description ?? undefined,
                              category: template.category ?? undefined,
                              tags: template.tags,
                              content: revisionContent
                            }
                          )
                          setRevisionFor(null)
                        }, 'Revision created.')
                      }
                    >
                      Create revision
                    </Button>
                    <Button onClick={() => setRevisionFor(null)}>Cancel</Button>
                  </Stack>
                </Stack>
              </Box>
            )}
          </Card>
        ))}
      </Stack>
    </Stack>
  )
}
