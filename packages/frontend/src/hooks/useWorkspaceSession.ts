import { useEffect, useState } from 'react'

import { api, type WorkspaceSession } from '@/api/http'
import { workspaceStore } from '@/store/workspaceStore'

type State = {
  session: (WorkspaceSession & { token: string }) | null
  loading: boolean
  error: string | null
}

export function useWorkspaceSession(): State {
  const [state, setState] = useState<State>({ session: null, loading: true, error: null })

  useEffect(() => {
    let active = true
    const establish = async () => {
      try {
        const stored = workspaceStore.active() ?? workspaceStore.browser()
        if (stored) {
          await api.workspace(stored.token)
          if (active) setState({ session: stored, loading: false, error: null })
          return
        }
        const created = await api.createWorkspace()
        const session = { ...created, token: created.token as string }
        workspaceStore.saveBrowser(session)
        if (active) setState({ session, loading: false, error: null })
      } catch (error) {
        if (active) {
          setState({
            session: null,
            loading: false,
            error:
              error instanceof Error ? error.message : 'Could not establish workspace.'
          })
        }
      }
    }
    void establish()
    return () => {
      active = false
    }
  }, [])

  return state
}
