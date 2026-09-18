import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'

import ErrorBoundary from '@/components/ErrorBoundary'
import { AdminPage } from '@/pages/admin/AdminPage'
import { Editor } from '@/pages/Editor'
import { LtiRegister } from '@/pages/lti/LtiRegister'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { StartPage } from '@/pages/StartPage'
import { TemplatesPage } from '@/pages/TemplatesPage'
import { WorkflowListPage } from '@/pages/WorkflowListPage'
import { WorkshopJoin } from '@/pages/WorkshopJoin'

const editor = (
  <ErrorBoundary>
    <Editor />
  </ErrorBoundary>
)

export const routes: RouteObject[] = [
  { path: '/', element: <StartPage /> },
  { path: '/workshop/:code', element: <WorkshopJoin /> },
  { path: '/workflows', element: <WorkflowListPage /> },
  { path: '/templates', element: <TemplatesPage /> },
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
