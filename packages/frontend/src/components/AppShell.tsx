import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import MenuIcon from '@mui/icons-material/Menu'
import {
  AppBar,
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme
} from '@mui/material'
import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

import { ColorSchemeMenuItems } from '@/components/ColorSchemeMenuItems'
import { useColorScheme } from '@/theme/colorScheme'

/** The destinations the title bar offers, in order (SPEC-0002/FR-007). */
export const NAVIGATION = [
  { label: 'Workflows', to: '/workflows' },
  { label: 'Templates', to: '/templates' },
  { label: 'Workshop', to: '/workshop' },
  { label: 'Facilitator', to: '/admin' }
] as const

/** A destination is current on its own path and on everything nested below it. */
const isCurrent = (pathname: string, to: string) =>
  pathname === to || pathname.startsWith(`${to}/`)

const AppearanceButton = () => {
  const { preference } = useColorScheme()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <Tooltip title={`Appearance: ${preference}`}>
        <IconButton
          aria-label="Appearance"
          color="inherit"
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          {preference === 'light' ? (
            <LightModeIcon />
          ) : preference === 'dark' ? (
            <DarkModeIcon />
          ) : (
            <BrightnessAutoIcon />
          )}
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <ColorSchemeMenuItems onSelect={() => setAnchor(null)} />
      </Menu>
    </>
  )
}

/** The navigation links in a row, the current one marked. */
const NavigationLinks = ({ pathname }: { pathname: string }) => (
  <Box component="nav" aria-label="Main" sx={{ display: 'flex', gap: 0.5 }}>
    {NAVIGATION.map(({ label, to }) => {
      const current = isCurrent(pathname, to)
      return (
        <Button
          key={to}
          component={Link}
          to={to}
          color="inherit"
          aria-current={current ? 'page' : undefined}
          sx={{
            fontWeight: current ? 700 : 500,
            borderBottom: 2,
            borderColor: current ? 'primary.main' : 'transparent',
            borderRadius: 0
          }}
        >
          {label}
        </Button>
      )
    })}
  </Box>
)

/** The same destinations behind one button, for widths the row does not fit. */
const NavigationMenu = ({ pathname }: { pathname: string }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <IconButton
        aria-label="Navigation"
        color="inherit"
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <MenuIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {NAVIGATION.map(({ label, to }) => {
          const current = isCurrent(pathname, to)
          return (
            <MenuItem
              key={to}
              component={Link}
              to={to}
              selected={current}
              aria-current={current ? 'page' : undefined}
              onClick={() => setAnchor(null)}
            >
              {label}
            </MenuItem>
          )
        })}
      </Menu>
    </>
  )
}

/**
 * The title bar of every page outside the editor (SPEC-0002/FR-007): the brand as the
 * way to the start page, the four destinations, and the appearance picker.
 */
export const TitleBar = () => {
  const { pathname } = useLocation()
  const theme = useTheme()
  const compact = useMediaQuery(theme.breakpoints.down('sm'))
  return (
    <AppBar position="sticky" color="inherit" elevation={1}>
      <Toolbar sx={{ gap: 1 }}>
        <Typography
          variant="h6"
          component={Link}
          to="/"
          sx={{ color: 'inherit', textDecoration: 'none', mr: 'auto' }}
        >
          NodeGrade
        </Typography>
        {compact ? (
          <NavigationMenu pathname={pathname} />
        ) : (
          <NavigationLinks pathname={pathname} />
        )}
        <AppearanceButton />
      </Toolbar>
    </AppBar>
  )
}

/**
 * The layout of every page outside the editor and the LTI registration popup: the title
 * bar, then the page. The editor keeps its own toolbar because every pixel of height
 * belongs to the canvas there.
 */
export const AppShell = () => (
  <>
    <TitleBar />
    <Outlet />
  </>
)
