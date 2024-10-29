/* eslint-disable simple-import-sort/imports */
import {
  createTheme,
  CssBaseline,
  GlobalStyles,
  ThemeProvider,
  useMediaQuery
} from '@mui/material'
import { createContext, useMemo, useState } from 'react'
import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider
} from 'react-router-dom'

import ErrorBoundary from '@/components/ErrorBoundary'
import Editor from '@/pages/Editor'
import { LtiRegister } from './lti/LtiRegister'
import StudentView from './StudentView'

const LogRouteAccess = () => {
  console.log('Current route: ', window.location.pathname)
  return null
}

const ColorModeContext = createContext({ toggleColorMode: () => {} })
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route>
      {/* /ke.moodle/2/2 */}
      <Route
        path="ws/editor/:domain/:courseId/:elementId"
        element={
          <ErrorBoundary>
            <Editor />
          </ErrorBoundary>
        }
      />
      <Route
        path="ws/student/:domain/:courseId/:elementId"
        element={
          <ErrorBoundary>
            <StudentView />
          </ErrorBoundary>
        }
      />
      <Route path="lti/register" element={<LtiRegister />} />
      {/* ... etc. */}
      <Route path="lti/login" element={<LogRouteAccess />} />
      <Route path="lti/deeplink" element={<LogRouteAccess />} />
      <Route
        path="*"
        element={
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          <LogRouteAccess />
        }
      />
      {/* <Route path="dashboard" element={<Dashboard />} /> */}
      {/* ... etc. */}
    </Route>
  )
)
export const BasicApp = () => {
  return <RouterProvider router={router} />
}

export const App = () => {
  const [mode, setMode] = useState<'light' | 'dark' | null>(null)
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)')
  const colorMode = useMemo(
    () => ({
      toggleColorMode: () => {
        setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'))
      }
    }),
    []
  )

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: 'dark'
        }
      }),
    [mode, prefersDarkMode]
  )

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <GlobalStyles
          styles={{
            '.lgraphcanvas': {
              color: '#121212'
            }
          }}
        />
        <BasicApp />
      </ThemeProvider>
    </ColorModeContext.Provider>
  )
}

export default App
