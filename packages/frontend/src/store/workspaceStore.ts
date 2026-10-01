import type { WorkspaceSession } from '@/api/http'
import { normalizeWorkshopCode } from '@/utils/workshopCode'

export type StoredSession = WorkspaceSession & { token: string }

const BROWSER_KEY = 'nodegrade.browser-workspace'
const ACTIVE_KEY = 'nodegrade.active-workspace'
const LAST_WORKSHOP_KEY = 'nodegrade.last-workshop'
const workshopKey = (code: string) =>
  `nodegrade.workshop-workspace.${normalizeWorkshopCode(code)}`

const readText = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const read = (key: string): StoredSession | null => {
  try {
    const value = readText(key)
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

const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // A profile with storage disabled or full still gets a usable session for this page
    // view; it just will not survive the reload (SPEC-0004/NFR-001 caveat).
  }
}

const writeSession = (key: string, session: StoredSession): void =>
  write(key, JSON.stringify(session))

/**
 * Participant identity kept in the browser (SPEC-0004/NFR-001, SPEC-0022).
 *
 * Two kinds of session live here: the browser's own anonymous workspace, minted on the
 * direct entry (SPEC-0002/FR-001), and one workspace per joined workshop. The active
 * session is the one the editor uses. Every workflow belongs to exactly one workspace,
 * so the hub a participant last used — the start page or a workshop — decides which
 * session is active: a direct-entry page activates the browser session each time it is
 * shown and again as it hands a workflow to the editor, a workshop route activates that
 * workshop's session as it joins (SPEC-0002 business rules).
 */
export const workspaceStore = {
  browser: () => read(BROWSER_KEY),
  workshop: (code: string) => read(workshopKey(code)),
  /** The workshop this browser joined most recently, for the way back to it. */
  lastWorkshop: (): StoredSession | null => {
    const code = readText(LAST_WORKSHOP_KEY)
    return code ? read(workshopKey(code)) : null
  },
  active: () => read(ACTIVE_KEY),
  /**
   * Keeps the browser workspace for later page views without making it current. The
   * bootstrap calls this and nothing else, so a mint that resolves after the participant
   * moved on to a workshop leaves the workshop's session active.
   */
  rememberBrowser(session: StoredSession) {
    writeSession(BROWSER_KEY, session)
  },
  /** Makes `session` the one the editor opens workflows with. */
  activate(session: StoredSession) {
    writeSession(ACTIVE_KEY, session)
  },
  saveWorkshop(code: string, session: StoredSession) {
    writeSession(workshopKey(code), session)
    writeSession(ACTIVE_KEY, session)
    write(LAST_WORKSHOP_KEY, normalizeWorkshopCode(code))
  },
  clearActive() {
    remove(ACTIVE_KEY)
  },
  /** Forgets the browser workspace, and the active session when it is that one. */
  clearBrowser() {
    const browser = read(BROWSER_KEY)
    const active = read(ACTIVE_KEY)
    remove(BROWSER_KEY)
    if (active && (!browser || active.id === browser.id)) remove(ACTIVE_KEY)
  }
}
