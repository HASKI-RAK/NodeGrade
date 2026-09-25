import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  Menu,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { api } from '@/api/http'
import { ColorSchemeMenuItems } from '@/components/ColorSchemeMenuItems'
import { useWorkspaceSession } from '@/hooks/useWorkspaceSession'
import { ensureWorkspaceSession } from '@/store/workspaceSession'
import { useColorScheme } from '@/theme/colorScheme'
import { normalizeWorkshopCode } from '@/utils/workshopCode'

const EMPTY_GRAPH =
  '{"last_node_id":0,"last_link_id":0,"nodes":[],"links":[],"groups":[],"config":{},"extra":{},"version":0.4}'

export const StartPage = () => {
  const navigate = useNavigate()
  const { session, error, retry } = useWorkspaceSession()
  const { preference } = useColorScheme()
  const [code, setCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [appearanceAnchor, setAppearanceAnchor] = useState<HTMLElement | null>(null)

  // Code entry and the conference deep link resolve through the same route, so the join
  // flow (SPEC-0014) has exactly one implementation to keep correct.
  const join = (event: FormEvent) => {
    event.preventDefault()
    const normalized = normalizeWorkshopCode(code)
    if (!normalized) {
      setMessage('Enter the workshop code from your handout.')
      return
    }
    setMessage(null)
    navigate(`/workshop/${normalized}`)
  }

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
    <Box maxWidth={760} mx="auto" p={4}>
      <Box display="flex" alignItems="flex-start" justifyContent="space-between">
        <Typography variant="h3" gutterBottom>
          NodeGrade
        </Typography>
        <Tooltip title={`Appearance: ${preference}`}>
          <IconButton
            aria-label="Appearance"
            onClick={(event) => setAppearanceAnchor(event.currentTarget)}
          >
            {preference === 'light' ? (
              <LightModeIcon />
            ) : preference === 'dark' ? (
              <DarkModeIcon />
            ) : (
              <BrightnessAutoIcon />
            )}
          </IconButton>
        </Tooltip>
      </Box>
      <Menu
        anchorEl={appearanceAnchor}
        open={!!appearanceAnchor}
        onClose={() => setAppearanceAnchor(null)}
      >
        <ColorSchemeMenuItems onSelect={() => setAppearanceAnchor(null)} />
      </Menu>
      <Typography color="text.secondary" mb={3}>
        Build and adapt assessment workflows.
      </Typography>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Start workshop
          </Typography>
          <Stack
            component="form"
            onSubmit={join}
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
          >
            <TextField
              label="Workshop code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputProps={{ 'data-testid': 'workshop-code' }}
            />
            <Button type="submit" variant="contained" data-testid="join-workshop">
              Join
            </Button>
          </Stack>
        </CardContent>
      </Card>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mt={3}>
        <Button variant="outlined" onClick={() => void create()} disabled={creating}>
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
