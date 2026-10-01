/**
 * What a tool records about a platform that may launch it (LTI 1.3 registration).
 *
 * The platform shows these values after the tool is registered: Moodle under
 * "View configuration details", Canvas on the developer key plus its fixed
 * Instructure endpoints. One registration is one `issuer` + `clientId` pair; a platform
 * that hosts many tenants under one issuer (Canvas) registers each client id.
 */
export interface LtiPlatformRegistration {
  /** The `iss` of every id_token this platform sends; also the login initiation `iss`. */
  issuer: string
  /** The client id the platform assigned to this tool; the id_token's `aud`. */
  clientId: string
  /** Every deployment the platform may launch from; one entry for most platforms. */
  deploymentIds: string[]
  /** Where the tool sends the OIDC authentication request (Moodle: mod/lti/auth.php). */
  authorizationEndpoint: string
  /** Where the tool fetches service access tokens later (Moodle: mod/lti/token.php). */
  tokenEndpoint: string
  /** The platform's public keys the id_token is verified with (Moodle: mod/lti/certs.php). */
  jwksUri: string
  /** Display name for logs and the tool platform fallback. */
  name?: string
}
