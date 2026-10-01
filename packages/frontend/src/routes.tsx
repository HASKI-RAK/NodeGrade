import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'

import { AppShell } from '@/components/AppShell'
import ErrorBoundary from '@/components/ErrorBoundary'
import { AdminPage } from '@/pages/admin/AdminPage'
import { Editor } from '@/pages/Editor'
import { LtiRegister } from '@/pages/lti/LtiRegister'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { StartPage } from '@/pages/StartPage'
import { TemplatesPage } from '@/pages/TemplatesPage'
import { WorkflowListPage } from '@/pages/WorkflowListPage'
import { WorkshopJoin } from '@/pages/WorkshopJoin'
import { WorkshopPage } from '@/pages/WorkshopPage'

const editor = (
  <ErrorBoundary>
    <Editor />
  </ErrorBoundary>
)

export const routes: RouteObject[] = [
  {
    // Every page under the title bar (SPEC-0002/FR-007). The editor and the LTI
    // registration popup stay outside: the first has its own toolbar, the second is an
    // iframe-sized dialog the platform opens.
    element: <AppShell />,
    children: [
      { path: '/', element: <StartPage /> },
      { path: '/workshop', element: <WorkshopPage /> },
      { path: '/workshop/:code', element: <WorkshopJoin /> },
      { path: '/workflows', element: <WorkflowListPage /> },
      { path: '/templates', element: <TemplatesPage /> },
      { path: '/admin', element: <Navigate to="/admin/workshops" replace /> },
      { path: '/admin/workshops', element: <AdminPage /> },
      { path: '/admin/providers', element: <AdminPage /> },
      { path: '/admin/templates', element: <AdminPage /> },
      { path: '*', element: <NotFoundPage /> }
    ]
  },
  { path: '/editor/:workflowId', element: editor },
  { path: '/student/:workflowId', element: editor },
  // Without a workflow in the path there is nothing to open, and the editor must not
  // fall back to deriving one from the URL (SPEC-0002/FR-005).
  { path: '/editor', element: <Navigate to="/" replace /> },
  { path: '/student', element: <Navigate to="/" replace /> },
  { path: '/lti/register', element: <LtiRegister /> }
]

export const router = createBrowserRouter(routes)
