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

export const WorkflowListPage = () => {
  const { session, loading, error, retry } = useWorkspaceSession()
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const navigate = useNavigate()

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
    <Box maxWidth={720} mx="auto" p={4}>
      <Button component={Link} to="/">
        Back
      </Button>
      <Typography variant="h4">My workflows</Typography>
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
      {workflows && (
        <>
          <List>
            {workflows.map((workflow) => (
              <ListItem key={workflow.id} disablePadding>
                <ListItemButton onClick={() => navigate(`/editor/${workflow.id}`)}>
                  <ListItemText
                    primary={workflow.name}
                    secondary={`Version ${workflow.version}`}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
          {workflows.length === 0 && <Typography>No workflows yet.</Typography>}
        </>
      )}
    </Box>
  )
}
