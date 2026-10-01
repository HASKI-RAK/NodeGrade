import { useCallback, useEffect, useState } from 'react'

import {
  type ActiveSession,
  describeBootstrapError,
  ensureWorkspaceSession,
  resetWorkspaceSession
} from '@/store/workspaceSession'
import { workspaceStore } from '@/store/workspaceStore'

type State = {
  session: ActiveSession | null
  loading: boolean
  error: string | null
}

export type WorkspaceSessionState = State & { retry: () => void }

/**
 * The browser workspace behind the direct-entry pages (SPEC-0002/FR-001). Every page
 * that mounts it shares one bootstrap; `retry` starts a fresh one after a failure.
 *
 * Each mount makes the browser session the active one, on the memoized path too: a
 * participant who came back from a workshop route expects the list and the editor to
 * act on the browser's workspace again (SPEC-0002 business rules). A page that was left
 * before the bootstrap resolved activates nothing.
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
        if (!active) return
        workspaceStore.activate(session)
        setState({ session, loading: false, error: null })
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
