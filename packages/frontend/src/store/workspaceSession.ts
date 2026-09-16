import { api, ApiError, type WorkspaceSession } from '@/api/http'
import { workspaceStore } from '@/store/workspaceStore'

export type ActiveSession = WorkspaceSession & { token: string }

let pending: Promise<ActiveSession> | null = null

const establish = async (): Promise<ActiveSession> => {
  const stored = workspaceStore.active() ?? workspaceStore.browser()
  if (stored?.token) {
    try {
      return { ...(await api.workspace(stored.token)), token: stored.token }
    } catch (error) {
      // A token the server no longer honours — retention sweep, reset database — must not
      // strand the participant on the start page. Drop it and mint a fresh workspace.
      if (!(error instanceof ApiError)) throw error
      workspaceStore.clearBrowser()
    }
  }
  const created = await api.createWorkspace()
  workspaceStore.saveBrowser(created)
  return created
}

/**
 * One workspace bootstrap per page view, shared by every caller.
 *
 * Without the shared promise a start page that both renders the session and creates a
 * workflow on click would mint two workspaces for one participant.
 */
export const ensureWorkspaceSession = (): Promise<ActiveSession> => {
  pending ??= establish().catch((error: unknown) => {
    pending = null
    throw error
  })
  return pending
}

/** Drops the memoized bootstrap so the next call retries from scratch. */
export const resetWorkspaceSession = (): void => {
  pending = null
}
