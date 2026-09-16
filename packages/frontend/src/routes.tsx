import { createBrowserRouter } from 'react-router-dom'

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

export const router = createBrowserRouter([
  { path: '/', element: <StartPage /> },
  { path: '/workshop/:code', element: <WorkshopJoin /> },
  { path: '/workflows', element: <WorkflowListPage /> },
  { path: '/templates', element: <TemplatesPage /> },
  { path: '/editor/:workflowId', element: editor },
  { path: '/student/:workflowId', element: editor },
  { path: '/admin', element: <AdminPage /> },
  { path: '/lti/register', element: <LtiRegister /> },
  { path: '*', element: <NotFoundPage /> }
])
