import { useMediaQuery } from '@mui/material'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'

export type ColorSchemePreference = 'system' | 'light' | 'dark'
export type ResolvedColorScheme = 'light' | 'dark'

export const COLOR_SCHEME_STORAGE_KEY = 'nodegrade:color-scheme'

/** PWA `theme-color` per resolved mode; kept next to the editor shell tones. */
export const THEME_COLOR: Record<ResolvedColorScheme, string> = {
  light: '#f6f7fb',
  dark: '#121212'
}

export const isColorSchemePreference = (value: unknown): value is ColorSchemePreference =>
  value === 'system' || value === 'light' || value === 'dark'

export const readColorSchemePreference = (): ColorSchemePreference => {
  try {
    const stored = window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)
    if (isColorSchemePreference(stored)) return stored
  } catch {
    // Private browsing or disabled storage: fall back to the system scheme.
  }
  return 'system'
}

/**
 * Resolve the effective mode. `system` follows the OS
 * `prefers-color-scheme` media query; an explicit choice always wins.
 */
export const resolveColorScheme = (
  preference: ColorSchemePreference,
  systemPrefersDark: boolean
): ResolvedColorScheme => {
  if (preference === 'light') return 'light'
  if (preference === 'dark') return 'dark'
  return systemPrefersDark ? 'dark' : 'light'
}

/** Keep the PWA `theme-color` meta in step with the resolved mode. */
export const applyThemeColorMeta = (mode: ResolvedColorScheme): void => {
  if (typeof document === 'undefined') return
  const existing = document.querySelector('meta[name="theme-color"]')
  if (existing) {
    existing.setAttribute('content', THEME_COLOR[mode])
    return
  }
  const meta = document.createElement('meta')
  meta.setAttribute('name', 'theme-color')
  meta.setAttribute('content', THEME_COLOR[mode])
  document.head.appendChild(meta)
}

type ColorSchemeContextValue = {
  /** Stored choice; `system` means the OS setting decides. */
  preference: ColorSchemePreference
  /** Effective mode after resolving `system` against the media query. */
  mode: ResolvedColorScheme
  setPreference: (preference: ColorSchemePreference) => void
}

const ColorSchemeContext = createContext<ColorSchemeContextValue>({
  preference: 'system',
  mode: 'light',
  setPreference: () => undefined
})

export const useColorScheme = (): ColorSchemeContextValue =>
  useContext(ColorSchemeContext)

export const ColorSchemeProvider = ({ children }: { children: ReactNode }) => {
  const [preference, setPreferenceState] = useState<ColorSchemePreference>(
    readColorSchemePreference
  )
  // Live subscription: flipping the OS theme while the app is open re-resolves.
  const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)', {
    noSsr: true
  })
  const mode = resolveColorScheme(preference, systemPrefersDark)

  const setPreference = useCallback((next: ColorSchemePreference) => {
    setPreferenceState(next)
    try {
      window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, next)
    } catch {
      // Storage unavailable: the choice still applies for this session.
    }
  }, [])

  useEffect(() => {
    applyThemeColorMeta(mode)
  }, [mode])

  const value = useMemo(
    () => ({ preference, mode, setPreference }),
    [preference, mode, setPreference]
  )
  return (
    <ColorSchemeContext.Provider value={value}>{children}</ColorSchemeContext.Provider>
  )
}
