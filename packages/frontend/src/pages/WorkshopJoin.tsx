import { Box, Button, CircularProgress, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { api } from '@/api/http'
import { workspaceStore } from '@/store/workspaceStore'

export const WorkshopJoin = () => {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const join = async () => {
      try {
        const result = await api.joinWorkshop(code, workspaceStore.workshop(code)?.token)
        if (!active) return
        workspaceStore.saveWorkshop(code, { ...result.workspace, token: result.token })
        navigate(`/editor/${result.workflow.id}`, { replace: true })
      } catch (joinError) {
        if (active)
          setError(
            joinError instanceof Error ? joinError.message : 'Workshop unavailable.'
          )
      }
    }
    void join()
    return () => {
      active = false
    }
  }, [code, navigate])

  return (
    <Box p={4}>
      {error ? (
        <>
          <Typography color="error">Workshop unavailable: {error}</Typography>
          <Button component={Link} to="/">
            Back to start
          </Button>
        </>
      ) : (
        <>
          <CircularProgress />
          <Typography>Joining workshop…</Typography>
        </>
      )}
    </Box>
  )
}
