import {
  Alert,
  Box,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography
} from '@mui/material'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { api, type Workflow } from '@/api/http'
import { useWorkspaceSession } from '@/hooks/useWorkspaceSession'
import { workspaceStore } from '@/store/workspaceStore'

/**
 * `/workflows`: the workflows of this browser's workspace (SPEC-0002/FR-004). Scoping is
 * the server's job; the client's part of it is presenting the token.
 */
export const WorkflowListPage = () => {
  const { session, loading, error, retry } = useWorkspaceSession()
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const navigate = useNavigate()

  // The list was read with this session; the editor opens the workflow with the active
  // one, so the two are made the same right before the hand-over.
  const open = (workflow: Workflow) => {
    if (session) workspaceStore.activate(session)
    navigate(`/editor/${workflow.id}`)
  }

  useEffect(() => {
    if (!session) return
    let active = true
    setListError(null)
    api
      .workflows(session.token)
      .then((result) => {
        if (active) setWorkflows(result)
      })
      .catch((fetchError: unknown) => {
        if (!active) return
        setListError(
          fetchError instanceof Error ? fetchError.message : 'Could not load workflows.'
        )
      })
    return () => {
      active = false
    }
  }, [session])

  return (
    <Box component="main" maxWidth={720} mx="auto" p={4}>
      <Typography variant="h4" component="h1" gutterBottom>
        My workflows
      </Typography>
      {(loading || (session && !workflows && !listError)) && <CircularProgress />}
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
      {listError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {listError}
        </Alert>
      )}
      {workflows &&
        (workflows.length === 0 ? (
          <Typography color="text.secondary">
            No workflows yet. Start one from a <Link to="/templates">template</Link> or
            create a new workflow on the <Link to="/">start page</Link>.
          </Typography>
        ) : (
          <List aria-label="My workflows">
            {workflows.map((workflow) => (
              <ListItem key={workflow.id} disablePadding>
                <ListItemButton onClick={() => open(workflow)}>
                  <ListItemText
                    primary={workflow.name}
                    secondary={`Version ${workflow.version}`}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        ))}
    </Box>
  )
}
