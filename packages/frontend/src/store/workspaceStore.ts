import type { WorkspaceSession } from '@/api/http'
import { normalizeWorkshopCode } from '@/utils/workshopCode'

type StoredSession = WorkspaceSession & { token: string }

const LEGACY_BROWSER_KEY = 'nodegrade.browser-workspace'
const ACTIVE_KEY = 'nodegrade.active-workspace'
const workshopKey = (code: string) =>
  `nodegrade.workshop-workspace.${normalizeWorkshopCode(code)}`

const read = (key: string): StoredSession | null => {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as StoredSession) : null
  } catch {
    return null
  }
}

const remove = (key: string): void => {
  try {
    localStorage.removeItem(key)
  } catch {
    // Same reasoning as write().
  }
}

const write = (key: string, session: StoredSession): void => {
  try {
    localStorage.setItem(key, JSON.stringify(session))
  } catch {
    // A profile with storage disabled or full still gets a usable session for this page
    // view; it just will not survive the reload (SPEC-0004/NFR-001 caveat).
  }
}

/**
 * Participant identity kept in the browser: one token per joined workshop, plus the one
 * the editor currently uses (SPEC-0004/NFR-001, SPEC-0022).
 *
 * Only workshop sessions are kept. A browser workspace stored before SPEC-0022 withdrew
 * them is dropped on first read: the server no longer honours its token.
 */
export const workspaceStore = {
  workshop: (code: string) => read(workshopKey(code)),
  active: (): StoredSession | null => {
    remove(LEGACY_BROWSER_KEY)
    const session = read(ACTIVE_KEY)
    if (session && session.type !== 'WORKSHOP') {
      remove(ACTIVE_KEY)
      return null
    }
    return session
  },
  saveWorkshop(code: string, session: StoredSession) {
    write(workshopKey(code), session)
    write(ACTIVE_KEY, session)
  },
  clearActive() {
    remove(ACTIVE_KEY)
  }
}
