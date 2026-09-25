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

import { ColorSchemeMenuItems } from '@/components/ColorSchemeMenuItems'
import { workspaceStore } from '@/store/workspaceStore'
import { useColorScheme } from '@/theme/colorScheme'
import { normalizeWorkshopCode } from '@/utils/workshopCode'

/**
 * The way in is a workshop code (SPEC-0022/FR-013): nothing here creates a workspace or
 * lists templates. A participant who already joined a workshop in this browser is offered
 * the way back to it.
 */
export const StartPage = () => {
  const navigate = useNavigate()
  const { preference } = useColorScheme()
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [appearanceAnchor, setAppearanceAnchor] = useState<HTMLElement | null>(null)
  const [active] = useState(() => workspaceStore.active()?.workshop ?? null)

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
      {active && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Continue where you left off
            </Typography>
            <Button
              variant="outlined"
              component={Link}
              to={`/workshop/${normalizeWorkshopCode(active.code)}`}
            >
              {active.title}
            </Button>
          </CardContent>
        </Card>
      )}
      <Stack direction="row" mt={3}>
        <Button variant="text" component={Link} to="/admin">
          Facilitator
        </Button>
      </Stack>
      {message && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {message}
        </Alert>
      )}
    </Box>
  )
}
