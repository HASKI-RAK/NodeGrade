import { useCallback, useEffect, useState } from 'react'

import {
  type ActiveSession,
  ensureWorkspaceSession,
  resetWorkspaceSession
} from '@/store/workspaceSession'

type State = {
  session: ActiveSession | null
  loading: boolean
  error: string | null
}

export type WorkspaceSessionState = State & { retry: () => void }

export function useWorkspaceSession(): WorkspaceSessionState {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<State>({
    session: null,
    loading: true,
    error: null
  })

  useEffect(() => {
    let active = true
    if (attempt > 0) setState({ session: null, loading: true, error: null })
    ensureWorkspaceSession()
      .then((session) => {
        if (active) setState({ session, loading: false, error: null })
      })
      .catch((error: unknown) => {
        if (!active) return
        setState({
          session: null,
          loading: false,
          error: error instanceof Error ? error.message : 'Could not establish workspace.'
        })
      })
    return () => {
      active = false
    }
  }, [attempt])

  const retry = useCallback(() => {
    resetWorkspaceSession()
    setAttempt((value) => value + 1)
  }, [])

  return { ...state, retry }
}
