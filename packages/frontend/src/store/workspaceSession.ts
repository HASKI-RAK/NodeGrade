import { api, ApiError } from '@/api/http'
import { type StoredSession, workspaceStore } from '@/store/workspaceStore'

export type ActiveSession = StoredSession

let pending: Promise<ActiveSession> | null = null

/**
 * The browser's own workspace: the stored one when the server still honours its token,
 * a freshly minted one otherwise (SPEC-0002/FR-001, SPEC-0004/FR-001). It is remembered
 * here and activated by the page that shows it, because only the page knows whether the
 * participant is still on a direct-entry route when the bootstrap resolves.
 */
const establish = async (): Promise<ActiveSession> => {
  const stored = workspaceStore.browser()
  if (stored?.token) {
    try {
      const session = { ...(await api.workspace(stored.token)), token: stored.token }
      workspaceStore.rememberBrowser(session)
      return session
    } catch (error) {
      // A token the server no longer honours (retention sweep, reset database) answers
      // 401: drop it and mint a fresh workspace. Every other failure is reported, so a
      // transient error never costs the participant the workspace holding their work.
      if (!(error instanceof ApiError) || error.status !== 401) throw error
      workspaceStore.clearBrowser()
    }
  }
  const created = await api.createWorkspace()
  workspaceStore.rememberBrowser(created)
  return created
}

/**
 * One workspace bootstrap per page view, shared by every caller.
 *
 * Without the shared promise a start page that both renders the session and creates a
 * workflow on click would mint two workspaces for one participant. The promise resolves
 * to the same session on every later call; making it active again is the caller's part,
 * since a workshop route may have activated its own session in between.
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

/**
 * What to tell the participant when the bootstrap failed. The throttle's refusal is the
 * one case with advice beyond "try again" (SPEC-0022/FR-015).
 */
export const describeBootstrapError = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.status === 429)
      return (
        error.body.message ??
        'Too many workspaces were created from your network. Wait a moment, then retry.'
      )
    return error.body.message ?? 'Could not establish a workspace.'
  }
  return 'Could not reach the server. Check your connection and try again.'
}
