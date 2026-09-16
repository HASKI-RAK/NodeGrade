import { createTheme, CssBaseline, GlobalStyles, ThemeProvider } from '@mui/material'
import { RouterProvider } from 'react-router-dom'

import { router } from '@/routes'

const theme = createTheme({ palette: { mode: 'light' } })

export const App = () => (
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <GlobalStyles styles={{ '.lgraphcanvas': { color: '#121212' } }} />
    <RouterProvider router={router} />
  </ThemeProvider>
)

export default App
