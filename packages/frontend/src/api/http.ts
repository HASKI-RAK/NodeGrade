import type { ModelCatalog } from '@haski/ta-lib'

import { getConfig } from '@/utils/config'

export type ApiErrorBody = {
  code?: string
  message?: string
  currentVersion?: number
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody
  ) {
    super(body.message ?? `Request failed (${status})`)
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
  token?: string | null
}

export async function apiRequest<T>(
  path: string,
  { body, token, headers, ...options }: RequestOptions = {}
): Promise<{ data: T; response: Response }> {
  const configured = (getConfig().API ?? '/api').replace(/\/$/, '')
  const base = configured.endsWith('/api') ? configured : `${configured}/api`
  const response = await fetch(`${base}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })

  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as ApiErrorBody
    throw new ApiError(response.status, parsed)
  }
  const data = response.status === 204 ? (undefined as T) : ((await response.json()) as T)
  return { data, response }
}

export type WorkspaceSession = {
  id: string
  type: 'BROWSER' | 'WORKSHOP' | 'LTI'
  label: string | null
  workshopId: string | null
  token?: string
}

export type Workflow = {
  id: string
  name: string
  slug: string
  version: number
  sourceTemplateId?: string | null
  sourceTemplateRevisionId?: string | null
  content?: string
  updatedAt?: string
}

export type TemplateKind = 'WORKFLOW' | 'BLOCK'
export type TemplateInterfacePort = {
  nodeId: number
  slot: number
  name: string
  type: string
}
export type TemplateInterfaces = {
  inputs?: TemplateInterfacePort[]
  outputs?: TemplateInterfacePort[]
}
export type WorkflowTemplate = {
  id: string
  slug: string
  kind: TemplateKind
  name: string
  description: string | null
  category: string | null
  tags: string[]
  currentRevision: number
}
export type TemplateRevision = {
  id: string
  revision: number
  name: string
  description: string | null
  category: string | null
  tags: string[]
  content: string
  interfaces: TemplateInterfaces | null
  requiredNodeTypes: string[]
}

/** Workshop preflight and facilitator readiness results (SPEC-0007/FR-009, FR-010). */
export type ReadinessCheck = {
  id: 'backend' | 'template' | 'node_types' | 'models'
  label: string
  status: 'PASS' | 'FAIL'
  detail: string
}
export type WorkshopReadiness = {
  status: 'PASS' | 'FAIL'
  checks: ReadinessCheck[]
}

export const api = {
  models: async () => (await apiRequest<ModelCatalog>('/models')).data,
  createWorkspace: async () => {
    const { data } = await apiRequest<{ workspace: WorkspaceSession; token: string }>(
      '/workspaces',
      { method: 'POST', body: {} }
    )
    // The token is a sibling of the workspace, not a field on it, and is never returned
    // again. Folding it in here is the only chance to keep it.
    return { ...data.workspace, token: data.token }
  },
  workspace: async (token: string) =>
    (await apiRequest<WorkspaceSession>('/workspaces/me', { token })).data,
  workflows: async (token?: string | null) =>
    (await apiRequest<{ workflows: Workflow[] }>('/workflows', { token })).data.workflows,
  workflow: async (id: string, token?: string | null) => {
    const result = await apiRequest<Workflow>(`/workflows/${id}`, { token })
    return {
      workflow: result.data,
      etag: result.response.headers.get('ETag') ?? `W/"${result.data.version}"`
    }
  },
  createWorkflow: async (token: string, name: string, content: string) =>
    (
      await apiRequest<Workflow>('/workflows', {
        method: 'POST',
        token,
        body: { name, content }
      })
    ).data,
  saveWorkflow: async (
    token: string | null,
    id: string,
    version: number,
    content: string
  ) =>
    (
      await apiRequest<Workflow>(`/workflows/${id}`, {
        method: 'PUT',
        token,
        headers: { 'If-Match': `W/"${version}"` },
        body: { content }
      })
    ).data,
  resetWorkflow: async (token: string | null, id: string) =>
    (
      await apiRequest<Workflow>(`/workflows/${id}/reset`, {
        method: 'POST',
        token,
        body: {}
      })
    ).data,
  publishWorkflow: async (token: string | null, id: string) =>
    (
      await apiRequest<Workflow>(`/workflows/${id}/publish`, {
        method: 'POST',
        token,
        body: {}
      })
    ).data,
  templates: async (kind?: TemplateKind) =>
    (
      await apiRequest<{ templates: WorkflowTemplate[] }>(
        `/templates${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`
      )
    ).data.templates,
  template: async (slug: string) =>
    (
      await apiRequest<{ template: WorkflowTemplate; revision: TemplateRevision }>(
        `/templates/${encodeURIComponent(slug)}`
      )
    ).data,
  fromTemplate: async (token: string, templateSlug: string) =>
    (
      await apiRequest<Workflow>('/workflows/from-template', {
        method: 'POST',
        token,
        body: { templateSlug }
      })
    ).data,
  workshop: async (code: string) =>
    (
      await apiRequest<{ workshop: { id: string; code: string; title: string } }>(
        `/workshops/by-code/${encodeURIComponent(code)}`
      )
    ).data.workshop,
  workshopPreflight: async (code: string) =>
    (
      await apiRequest<WorkshopReadiness>(
        `/workshops/by-code/${encodeURIComponent(code)}/preflight`
      )
    ).data,
  joinWorkshop: async (code: string, token?: string) =>
    (
      await apiRequest<{
        workspace: WorkspaceSession
        token: string
        workflow: Workflow
      }>(`/workshops/by-code/${encodeURIComponent(code)}/join`, {
        method: 'POST',
        token,
        body: {}
      })
    ).data
}
