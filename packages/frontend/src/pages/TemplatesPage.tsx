import { Alert, Box, Button, Chip, CircularProgress, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api, ApiError, type WorkflowTemplate } from '@/api/http'
import {
  TemplateCard,
  type TemplatePreview,
  TemplateStructureDialog
} from '@/components/TemplateCard'
import { useWorkspaceSession } from '@/hooks/useWorkspaceSession'

const UNREACHABLE = 'Could not reach the server. Check your connection and try again.'

/**
 * `/templates`: the gallery of published workflow templates (SPEC-0002/FR-003a). "Use
 * template" copies one into this browser's workspace and opens the copy; the structure
 * preview shows what a template holds before that.
 */
export const TemplatesPage = () => {
  const { session, loading, error, retry } = useWorkspaceSession()
  const [templates, setTemplates] = useState<WorkflowTemplate[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [preview, setPreview] = useState<TemplatePreview | null>(null)
  const [using, setUsing] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!session) return
    let active = true
    setListError(null)
    api
      .templates(session.token, 'WORKFLOW')
      .then((result) => {
        if (active) setTemplates(result)
      })
      .catch((fetchError: unknown) => {
        if (!active) return
        setListError(
          fetchError instanceof Error ? fetchError.message : 'Could not load templates.'
        )
      })
    return () => {
      active = false
    }
  }, [session])

  const showStructure = async (template: WorkflowTemplate) => {
    if (!session) return
    const { name, description, tags } = template
    setPreview({ name, description, tags, content: null })
    try {
      const detail = await api.template(template.slug, session.token)
      setPreview({ name, description, tags, content: detail.revision.content })
    } catch {
      setPreview(null)
      setActionError('The template structure could not be loaded.')
    }
  }

  const use = async (template: WorkflowTemplate) => {
    if (!session) return
    setUsing(template.slug)
    setActionError(null)
    try {
      const workflow = await api.fromTemplate(session.token, template.slug)
      navigate(`/editor/${workflow.id}`)
    } catch (useError) {
      setActionError(
        useError instanceof ApiError
          ? (useError.body.message ?? 'This template could not be used.')
          : UNREACHABLE
      )
      setUsing(null)
    }
  }

  return (
    <Box component="main" maxWidth={1080} mx="auto" p={{ xs: 2, sm: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Templates
      </Typography>
      <Typography color="text.secondary" mb={2}>
        Complete assessment workflows to start from. Using one gives you a copy of your
        own; the template itself stays as it is.
      </Typography>
      {(loading || (session && !templates && !listError)) && <CircularProgress />}
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={retry}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      {listError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {listError}
        </Alert>
      )}
      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}
      {templates && templates.length === 0 && (
        <Typography color="text.secondary">No templates are published yet.</Typography>
      )}
      <Box
        sx={{
          columns: { xs: 1, md: 2 },
          columnGap: 2,
          '& > *': { breakInside: 'avoid', mb: 2 }
        }}
      >
        {templates?.map((template) => (
          <TemplateCard
            key={template.id}
            name={template.name}
            description={template.description}
            tags={template.tags}
            labels={
              template.category ? (
                <Chip label={template.category} variant="outlined" />
              ) : null
            }
            actions={
              <>
                <Button onClick={() => void showStructure(template)}>
                  Preview structure
                </Button>
                <Button
                  variant="contained"
                  disabled={using !== null}
                  onClick={() => void use(template)}
                >
                  {using === template.slug ? 'Copying…' : 'Use template'}
                </Button>
              </>
            }
          />
        ))}
      </Box>
      <TemplateStructureDialog preview={preview} onClose={() => setPreview(null)} />
    </Box>
  )
}
