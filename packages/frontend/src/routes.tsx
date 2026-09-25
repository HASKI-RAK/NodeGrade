import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'

import ErrorBoundary from '@/components/ErrorBoundary'
import { AdminPage } from '@/pages/admin/AdminPage'
import { Editor } from '@/pages/Editor'
import { LtiRegister } from '@/pages/lti/LtiRegister'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { StartPage } from '@/pages/StartPage'
import { WorkshopJoin } from '@/pages/WorkshopJoin'
import { workspaceStore } from '@/store/workspaceStore'
import { normalizeWorkshopCode } from '@/utils/workshopCode'

/**
 * The former gallery and workflow list live in the workshop overview now (SPEC-0022):
 * old links land there, or on the start page without a workshop.
 */
const ToWorkshop = () => {
  const code = workspaceStore.active()?.workshop?.code
  return <Navigate to={code ? `/workshop/${normalizeWorkshopCode(code)}` : '/'} replace />
}

const editor = (
  <ErrorBoundary>
    <Editor />
  </ErrorBoundary>
)

export const routes: RouteObject[] = [
  { path: '/', element: <StartPage /> },
  { path: '/workshop/:code', element: <WorkshopJoin /> },
  { path: '/workflows', element: <ToWorkshop /> },
  { path: '/templates', element: <ToWorkshop /> },
  { path: '/editor/:workflowId', element: editor },
  { path: '/student/:workflowId', element: editor },
  // Without a workflow in the path there is nothing to open, and the editor must not
  // fall back to deriving one from the URL (SPEC-0002/FR-005).
  { path: '/editor', element: <Navigate to="/" replace /> },
  { path: '/student', element: <Navigate to="/" replace /> },
  { path: '/admin', element: <Navigate to="/admin/workshops" replace /> },

  { path: '/admin/workshops', element: <AdminPage /> },

  { path: '/admin/providers', element: <AdminPage /> },
  { path: '/admin/templates', element: <AdminPage /> },
  { path: '/lti/register', element: <LtiRegister /> },
  { path: '*', element: <NotFoundPage /> }
]

export const router = createBrowserRouter(routes)
