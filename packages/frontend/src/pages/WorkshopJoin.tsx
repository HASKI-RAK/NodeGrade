import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { api, ApiError } from '@/api/http'
import { resetWorkspaceSession } from '@/store/workspaceSession'
import { workspaceStore } from '@/store/workspaceStore'
import { normalizeWorkshopCode } from '@/utils/workshopCode'

const UNAVAILABLE =
  'This workshop is unavailable. Check the code on your handout, or ask the facilitator whether the workshop is still open.'

export const WorkshopJoin = () => {
  const { code = '' } = useParams()
  const normalized = normalizeWorkshopCode(code)
  const navigate = useNavigate()
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const join = async () => {
      setError(null)
      if (!normalized) {
        setError(UNAVAILABLE)
        return
      }
      try {
        const result = await api.joinWorkshop(
          normalized,
          workspaceStore.workshop(normalized)?.token
        )
        if (!active) return
        workspaceStore.saveWorkshop(normalized, {
          ...result.workspace,
          token: result.token
        })
        // The workshop workspace is now the active one; the memoized browser bootstrap
        // would otherwise keep answering for the rest of the page view.
        resetWorkspaceSession()
        navigate(`/editor/${result.workflow.id}`, { replace: true })
      } catch (joinError) {
        if (!active) return
        // A closed, expired, unpublished or unknown code is one user-facing state; a
        // transport failure is a different one, because only the second is worth retrying.
        setError(
          joinError instanceof ApiError
            ? UNAVAILABLE
            : 'Could not reach the server. Check your connection and try again.'
        )
      }
    }
    void join()
    return () => {
      active = false
    }
  }, [normalized, navigate, attempt])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  if (error)
    return (
      <Box maxWidth={600} mx="auto" p={4}>
        <Typography variant="h4" gutterBottom>
          Workshop unavailable
        </Typography>
        <Alert severity="error">{error}</Alert>
        <Stack direction="row" spacing={1} mt={2}>
          <Button variant="contained" onClick={retry}>
            Try again
          </Button>
          <Button component={Link} to="/">
            Back to start
          </Button>
        </Stack>
      </Box>
    )

  return (
    <Box maxWidth={600} mx="auto" p={4}>
      <Stack direction="row" spacing={2} alignItems="center">
        <CircularProgress />
        <Typography>Joining workshop…</Typography>
      </Stack>
    </Box>
  )
}
