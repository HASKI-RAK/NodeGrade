import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyThemeColorMeta,
  COLOR_SCHEME_STORAGE_KEY,
  ColorSchemeProvider,
  isColorSchemePreference,
  readColorSchemePreference,
  resolveColorScheme,
  THEME_COLOR,
  useColorScheme
} from './colorScheme'

type ChangeListener = (event: { matches: boolean }) => void

const stubMatchMedia = (initial: boolean) => {
  let matches = initial
  const listeners = new Set<ChangeListener>()
  const add = (listener: ChangeListener): void => {
    listeners.add(listener)
  }
  const remove = (listener: ChangeListener): void => {
    listeners.delete(listener)
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      get matches() {
        return matches
      },
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: add,
      removeListener: remove,
      addEventListener: (_type: string, listener: ChangeListener) => add(listener),
      removeEventListener: (_type: string, listener: ChangeListener) => remove(listener),
      dispatchEvent: () => false
    })
  )
  return {
    fire(next: boolean): void {
      matches = next
      listeners.forEach((listener) => listener({ matches: next }))
    }
  }
}

const Probe = () => {
  const { preference, mode, setPreference } = useColorScheme()
  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <span data-testid="mode">{mode}</span>
      <button type="button" onClick={() => setPreference('dark')}>
        go-dark
      </button>
      <button type="button" onClick={() => setPreference('light')}>
        go-light
      </button>
      <button type="button" onClick={() => setPreference('system')}>
        go-system
      </button>
    </div>
  )
}

describe('resolveColorScheme', () => {
  it.each([
    ['system', false, 'light'],
    ['system', true, 'dark'],
    ['light', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['dark', true, 'dark']
  ] as const)('resolves %s with systemDark=%s to %s', (preference, systemDark, mode) => {
    expect(resolveColorScheme(preference, systemDark)).toBe(mode)
  })
})

describe('color scheme preference storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('accepts only the known stored values', () => {
    expect(isColorSchemePreference('system')).toBe(true)
    expect(isColorSchemePreference('light')).toBe(true)
    expect(isColorSchemePreference('dark')).toBe(true)
    expect(isColorSchemePreference('amoled')).toBe(false)
    expect(isColorSchemePreference(null)).toBe(false)
    expect(isColorSchemePreference(undefined)).toBe(false)
  })

  it('defaults to system and ignores unknown stored values', () => {
    expect(readColorSchemePreference()).toBe('system')
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, 'amoled')
    expect(readColorSchemePreference()).toBe('system')
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, 'dark')
    expect(readColorSchemePreference()).toBe('dark')
  })
})

describe('ColorSchemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.querySelector('meta[name="theme-color"]')?.remove()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('follows the system scheme automatically and live', async () => {
    const media = stubMatchMedia(true)
    render(
      <ColorSchemeProvider>
        <Probe />
      </ColorSchemeProvider>
    )

    expect(screen.getByTestId('preference')).toHaveTextContent('system')
    expect(screen.getByTestId('mode')).toHaveTextContent('dark')
    expect(
      document.querySelector('meta[name="theme-color"]')?.getAttribute('content')
    ).toBe(THEME_COLOR.dark)

    await act(async () => {
      media.fire(false)
    })
    expect(
      await screen.findByText('light', { selector: '[data-testid="mode"]' })
    ).toBeVisible()
  })

  it('lets an explicit choice win over the system and persists it', async () => {
    const user = userEvent.setup()
    const media = stubMatchMedia(false)
    render(
      <ColorSchemeProvider>
        <Probe />
      </ColorSchemeProvider>
    )

    await user.click(screen.getByRole('button', { name: 'go-dark' }))
    expect(screen.getByTestId('mode')).toHaveTextContent('dark')
    expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('dark')

    // A later OS switch no longer overrides the explicit choice.
    await act(async () => {
      media.fire(true)
    })
    expect(screen.getByTestId('mode')).toHaveTextContent('dark')

    await user.click(screen.getByRole('button', { name: 'go-system' }))
    expect(screen.getByTestId('mode')).toHaveTextContent('dark')
    await act(async () => {
      media.fire(false)
    })
    expect(
      await screen.findByText('light', { selector: '[data-testid="mode"]' })
    ).toBeVisible()
  })

  it('restores the stored choice on mount', () => {
    stubMatchMedia(false)
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, 'dark')
    render(
      <ColorSchemeProvider>
        <Probe />
      </ColorSchemeProvider>
    )
    expect(screen.getByTestId('preference')).toHaveTextContent('dark')
    expect(screen.getByTestId('mode')).toHaveTextContent('dark')
  })
})

describe('applyThemeColorMeta', () => {
  beforeEach(() => {
    document.querySelector('meta[name="theme-color"]')?.remove()
  })

  it('creates the meta tag when missing and updates it when present', () => {
    applyThemeColorMeta('light')
    const meta = document.querySelector('meta[name="theme-color"]')
    expect(meta?.getAttribute('content')).toBe(THEME_COLOR.light)
    applyThemeColorMeta('dark')
    expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1)
    expect(meta?.getAttribute('content')).toBe(THEME_COLOR.dark)
  })
})
