import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto'
import CheckIcon from '@mui/icons-material/Check'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import { ListItemIcon, ListItemText, MenuItem } from '@mui/material'
import type { ReactNode } from 'react'

import { type ColorSchemePreference, useColorScheme } from '@/theme/colorScheme'

const options: Array<{
  value: ColorSchemePreference
  label: string
  hint: string
  icon: ReactNode
}> = [
  {
    value: 'system',
    label: 'System',
    hint: 'Follow your device',
    icon: <BrightnessAutoIcon fontSize="small" />
  },
  {
    value: 'light',
    label: 'Light',
    hint: 'Always light',
    icon: <LightModeIcon fontSize="small" />
  },
  {
    value: 'dark',
    label: 'Dark',
    hint: 'Always dark',
    icon: <DarkModeIcon fontSize="small" />
  }
]

/**
 * Shared appearance picker rendered inside any MUI `Menu`. Reads the color
 * scheme from context so pages need no prop drilling; safe to render without
 * a provider (falls back to a no-op `system` choice, e.g. in unit tests).
 * Returns an array because `Menu` does not accept a Fragment child.
 */
export const ColorSchemeMenuItems = ({ onSelect }: { onSelect?: () => void }) => {
  const { preference, setPreference } = useColorScheme()
  return options.map(({ value, label, hint, icon }) => (
    <MenuItem
      key={value}
      selected={preference === value}
      onClick={() => {
        setPreference(value)
        onSelect?.()
      }}
    >
      <ListItemIcon>{icon}</ListItemIcon>
      <ListItemText primary={label} secondary={hint} />
      {preference === value ? (
        <CheckIcon fontSize="small" aria-label={`${label} (current)`} />
      ) : null}
    </MenuItem>
  ))
}
