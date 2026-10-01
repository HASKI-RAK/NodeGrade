import { useCallback, useEffect, useState } from 'react'

import {
  type ActiveSession,
  describeBootstrapError,
  ensureWorkspaceSession,
  resetWorkspaceSession
} from '@/store/workspaceSession'

type State = {
  session: ActiveSession | null
  loading: boolean
  error: string | null
}

export type WorkspaceSessionState = State & { retry: () => void }

/**
 * The browser workspace behind the direct-entry pages (SPEC-0002/FR-001). Every page
 * that mounts it shares one bootstrap; `retry` starts a fresh one after a failure.
 */
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
        if (active)
          setState({
            session: null,
            loading: false,
            error: describeBootstrapError(error)
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
