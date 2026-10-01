import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Link as TextLink,
  Typography
} from '@mui/material'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { api } from '@/api/http'
import { useWorkspaceSession } from '@/hooks/useWorkspaceSession'
import { ensureWorkspaceSession } from '@/store/workspaceSession'
import { workspaceStore } from '@/store/workspaceStore'

const EMPTY_GRAPH =
  '{"last_node_id":0,"last_link_id":0,"nodes":[],"links":[],"groups":[],"config":{},"extra":{},"version":0.4}'

/**
 * The direct entry (SPEC-0002/FR-001): this browser gets a workspace of its own and
 * three ways into it. Workshop participants are pointed to the workshop hub, where the
 * code entry lives (FR-001a).
 */
export const StartPage = () => {
  const navigate = useNavigate()
  const { session, error, retry } = useWorkspaceSession()
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const create = async () => {
    setMessage(null)
    setCreating(true)
    try {
      // The entry actions are usable before the bootstrap finishes; the click waits for
      // the same shared promise the hook is already on.
      const active = session ?? (await ensureWorkspaceSession())
      const workflow = await api.createWorkflow(
        active.token,
        'Untitled workflow',
        EMPTY_GRAPH
      )
      // The editor opens the workflow with the active session; make it the one that
      // owns the workflow, whatever another tab or a workshop visit activated meanwhile.
      workspaceStore.activate(active)
      navigate(`/editor/${workflow.id}`)
    } catch (createError) {
      setMessage(
        createError instanceof Error
          ? createError.message
          : 'Could not create a workflow.'
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <Box component="main" maxWidth={760} mx="auto" p={4}>
      <Typography variant="h3" component="h1" gutterBottom>
        NodeGrade
      </Typography>
      <Typography color="text.secondary" mb={3}>
        Build and adapt assessment workflows: node graphs that grade short answers with
        language models and NLP.
      </Typography>
      <Card>
        <CardContent>
          <Typography variant="h5" component="h2" gutterBottom>
            Get started
          </Typography>
          <Typography color="text.secondary">
            This browser has a workspace of its own. Every workflow you create or copy
            here stays in it and is yours to come back to.
          </Typography>
        </CardContent>
        <CardActions sx={{ flexWrap: 'wrap', gap: 1, px: 2, pb: 2 }}>
          <Button variant="contained" onClick={() => void create()} disabled={creating}>
            New workflow
          </Button>
          <Button variant="outlined" component={Link} to="/workflows">
            My workflows
          </Button>
          <Button variant="outlined" component={Link} to="/templates">
            Templates
          </Button>
        </CardActions>
      </Card>
      <Typography mt={3}>
        Taking part in a workshop? Enter the code from your handout on the{' '}
        <TextLink component={Link} to="/workshop">
          workshop page
        </TextLink>
        .
      </Typography>
      {message && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {message}
        </Alert>
      )}
      {error && (
        <Alert
          severity="error"
          sx={{ mt: 2 }}
          action={
            <Button color="inherit" size="small" onClick={retry}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}
    </Box>
  )
}
