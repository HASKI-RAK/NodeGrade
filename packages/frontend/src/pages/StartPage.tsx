import {
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography
} from '@mui/material'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { api } from '@/api/http'
import { useWorkspaceSession } from '@/hooks/useWorkspaceSession'
import { workspaceStore } from '@/store/workspaceStore'

const EMPTY_GRAPH =
  '{"last_node_id":0,"last_link_id":0,"nodes":[],"links":[],"groups":[],"config":{},"extra":{},"version":0.4}'

export const StartPage = () => {
  const navigate = useNavigate()
  const { session, loading, error } = useWorkspaceSession()
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const join = async () => {
    setMessage(null)
    try {
      const existing = workspaceStore.workshop(code)
      const result = await api.joinWorkshop(code, existing?.token)
      const joined = { ...result.workspace, token: result.token }
      workspaceStore.saveWorkshop(code, joined)
      navigate(`/editor/${result.workflow.id}`)
    } catch (joinError) {
      setMessage(joinError instanceof Error ? joinError.message : 'Workshop unavailable.')
    }
  }
  const create = async () => {
    if (!session) return
    const workflow = await api.createWorkflow(
      session.token,
      'Untitled workflow',
      EMPTY_GRAPH
    )
    navigate(`/editor/${workflow.id}`)
  }

  return (
    <Box maxWidth={760} mx="auto" p={4}>
      <Typography variant="h3" gutterBottom>
        NodeGrade
      </Typography>
      <Typography color="text.secondary" mb={3}>
        Build and adapt assessment workflows.
      </Typography>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Start workshop
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              label="Workshop code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputProps={{ 'data-testid': 'workshop-code' }}
            />
            <Button
              variant="contained"
              onClick={() => void join()}
              disabled={!code.trim()}
              data-testid="join-workshop"
            >
              Join
            </Button>
          </Stack>
          {message && (
            <Typography color="error" mt={1}>
              {message}
            </Typography>
          )}
        </CardContent>
      </Card>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mt={3}>
        <Button
          variant="outlined"
          onClick={() => void create()}
          disabled={loading || !session}
        >
          New workflow
        </Button>
        <Button variant="outlined" component={Link} to="/workflows">
          Open workflow
        </Button>
        <Button variant="outlined" component={Link} to="/templates">
          Templates
        </Button>
        <Button variant="text" component={Link} to="/admin">
          Facilitator
        </Button>
      </Stack>
      {error && (
        <Typography color="error" mt={2}>
          {error}
        </Typography>
      )}
    </Box>
  )
}
