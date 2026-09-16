import type { WorkspaceSession } from '@/api/http'

type StoredSession = WorkspaceSession & { token: string }

const BROWSER_KEY = 'nodegrade.browser-workspace'
const ACTIVE_KEY = 'nodegrade.active-workspace'
const workshopKey = (code: string) =>
  `nodegrade.workshop-workspace.${code.toUpperCase().replace(/[^0-9A-Z]/g, '')}`

const read = (key: string): StoredSession | null => {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as StoredSession) : null
  } catch {
    return null
  }
}

const write = (key: string, session: StoredSession): void => {
  localStorage.setItem(key, JSON.stringify(session))
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
    localStorage.removeItem(ACTIVE_KEY)
  }
}
