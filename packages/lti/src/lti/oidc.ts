import { LtiPlatformRegistration } from './platform'

/**
 * The third-party initiated login a platform starts a launch with (1EdTech Security
 * Framework 1.0, section 5.1.1.1; OpenID Connect Core, section 4).
 *
 * `iss` and `login_hint` are what the tool needs; the rest is optional in the
 * specification and only checked when present.
 */
export interface OidcLoginRequest {
  iss: string
  login_hint: string
  target_link_uri?: string
  lti_message_hint?: string
  client_id?: string
  lti_deployment_id?: string
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Reads a login initiation out of a query string or form body. Returns null for
 * anything that is not one, so a caller never works with half a request.
 */
export function readOidcLoginRequest(raw: unknown): OidcLoginRequest | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const iss = text(record.iss)
  const loginHint = text(record.login_hint)
  if (!iss || !loginHint || !isHttpUrl(iss)) return null
  const targetLinkUri = text(record.target_link_uri)
  if (targetLinkUri !== undefined && !isHttpUrl(targetLinkUri)) return null
  return {
    iss,
    login_hint: loginHint,
    target_link_uri: targetLinkUri,
    lti_message_hint: text(record.lti_message_hint),
    client_id: text(record.client_id),
    lti_deployment_id: text(record.lti_deployment_id)
  }
}

export interface OidcAuthorizationRequest {
  platform: Pick<LtiPlatformRegistration, 'authorizationEndpoint' | 'clientId'>
  /** The tool's launch URL; must be one of the redirect URIs registered on the platform. */
  redirectUri: string
  loginHint: string
  ltiMessageHint?: string
  state: string
  nonce: string
}

/**
 * The authentication request the tool answers a login initiation with (Security
 * Framework 1.0, section 5.1.1.2). Every value but the hints is fixed by the
 * specification: an id_token, posted back as a form, without a login prompt.
 */
export function buildOidcAuthorizationUrl(request: OidcAuthorizationRequest): string {
  const url = new URL(request.platform.authorizationEndpoint)
  url.searchParams.set('scope', 'openid')
  url.searchParams.set('response_type', 'id_token')
  url.searchParams.set('response_mode', 'form_post')
  url.searchParams.set('prompt', 'none')
  url.searchParams.set('client_id', request.platform.clientId)
  url.searchParams.set('redirect_uri', request.redirectUri)
  url.searchParams.set('login_hint', request.loginHint)
  url.searchParams.set('state', request.state)
  url.searchParams.set('nonce', request.nonce)
  if (request.ltiMessageHint !== undefined) {
    url.searchParams.set('lti_message_hint', request.ltiMessageHint)
  }
  return url.toString()
}
