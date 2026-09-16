import { vi } from 'vitest'

/** Shapes a JSON response the way `apiRequest` expects to read one. */
export const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  })

/**
 * Stubs `fetch` at the network edge rather than mocking `@/api/http`, so the client's own
 * request shaping — bearer header, base path, error mapping — is part of what is tested.
 */
export const stubApi = (handler: (url: string, init: RequestInit) => Response) => {
  const fetchMock = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) =>
    Promise.resolve(handler(String(input), init))
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export const authorizationOf = (init: RequestInit): string | null => {
  const headers = new Headers(init.headers)
  return headers.get('Authorization')
}
