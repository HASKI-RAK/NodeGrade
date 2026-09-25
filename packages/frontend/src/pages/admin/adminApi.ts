import { apiRequest } from '@/api/http'

/** The double-submit CSRF token the facilitator session cookie pairs with. */
const csrf = () =>
  document.cookie
    .split('; ')
    .find((part) => part.startsWith('ng_admin_csrf='))
    ?.split('=')
    .slice(1)
    .join('=')

const csrfHeader = () => ({ 'X-CSRF-Token': decodeURIComponent(csrf() ?? '') })

export const adminPost = <T>(path: string, body: unknown = {}) =>
  apiRequest<T>(path, { method: 'POST', headers: csrfHeader(), body })

export const adminPut = <T>(path: string, body: unknown) =>
  apiRequest<T>(path, { method: 'PUT', headers: csrfHeader(), body })
