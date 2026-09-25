import { createTheme, CssBaseline, GlobalStyles, ThemeProvider } from '@mui/material'
import { useMemo } from 'react'
import { RouterProvider } from 'react-router-dom'

import { router } from '@/routes'
import { ColorSchemeProvider, useColorScheme } from '@/theme/colorScheme'

const ThemedApp = () => {
  const { mode } = useColorScheme()
  const theme = useMemo(() => createTheme({ palette: { mode } }), [mode])
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      <GlobalStyles
        styles={{ '.lgraphcanvas': { color: mode === 'dark' ? '#e6e6e6' : '#121212' } }}
      />
      <RouterProvider router={router} />
    </ThemeProvider>
  )
}

export const App = () => (
  <ColorSchemeProvider>
    <ThemedApp />
  </ColorSchemeProvider>
)

export default App
