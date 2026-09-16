import {
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
  const { session, loading } = useWorkspaceSession()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const navigate = useNavigate()
  useEffect(() => {
    if (session) void api.workflows(session.token).then(setWorkflows)
  }, [session])
  if (loading)
    return (
      <Box p={4}>
        <CircularProgress />
      </Box>
    )
  return (
    <Box maxWidth={720} mx="auto" p={4}>
      <Button component={Link} to="/">
        Back
      </Button>
      <Typography variant="h4">My workflows</Typography>
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
    </Box>
  )
}
