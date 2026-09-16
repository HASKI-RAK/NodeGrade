import type { WorkspaceSession } from '@/api/http'
import { normalizeWorkshopCode } from '@/utils/workshopCode'

type StoredSession = WorkspaceSession & { token: string }

const BROWSER_KEY = 'nodegrade.browser-workspace'
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

const write = (key: string, session: StoredSession): void => {
  try {
    localStorage.setItem(key, JSON.stringify(session))
  } catch {
    // A profile with storage disabled or full still gets a usable session for this page
    // view; it just will not survive the reload (SPEC-0004/NFR-001 caveat).
  }
}

export const workspaceStore = {
  browser: () => read(BROWSER_KEY),
  workshop: (code: string) => read(workshopKey(code)),
  active: () => read(ACTIVE_KEY),
  saveBrowser(session: StoredSession) {
    write(BROWSER_KEY, session)
    write(ACTIVE_KEY, session)
  },
  saveWorkshop(code: string, session: StoredSession) {
    write(workshopKey(code), session)
    write(ACTIVE_KEY, session)
  },
  activate(session: StoredSession) {
    write(ACTIVE_KEY, session)
  },
  clearActive() {
    try {
      localStorage.removeItem(ACTIVE_KEY)
    } catch {
      // Same reasoning as write().
    }
  },
  clearBrowser() {
    try {
      localStorage.removeItem(BROWSER_KEY)
      localStorage.removeItem(ACTIVE_KEY)
    } catch {
      // Same reasoning as write().
    }
  }
}
