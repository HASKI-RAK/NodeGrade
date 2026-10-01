import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography
} from '@mui/material'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { workspaceStore } from '@/store/workspaceStore'
import { normalizeWorkshopCode } from '@/utils/workshopCode'

/**
 * The workshop hub (SPEC-0002/FR-008): the code entry, and the way back to the workshop
 * this browser joined last. Nothing here creates a workspace; the join route does that.
 */
export const WorkshopPage = () => {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [last] = useState(() => workspaceStore.lastWorkshop()?.workshop ?? null)

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
    <Box component="main" maxWidth={760} mx="auto" p={4}>
      <Typography variant="h3" component="h1" gutterBottom>
        Workshop
      </Typography>
      <Typography color="text.secondary" mb={3}>
        A workshop code is the eight-character code on your handout. It opens the
        templates the facilitator prepared, in a workspace of your own that is separate
        from this browser&apos;s workflows.
      </Typography>
      <Card>
        <CardContent>
          <Typography variant="h5" component="h2" gutterBottom>
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
      {last && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Typography variant="h6" component="h2" gutterBottom>
              Continue where you left off
            </Typography>
            <Button
              variant="outlined"
              component={Link}
              to={`/workshop/${normalizeWorkshopCode(last.code)}`}
            >
              {last.title}
            </Button>
          </CardContent>
        </Card>
      )}
      {message && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {message}
        </Alert>
      )}
    </Box>
  )
}
