import jwt from 'jsonwebtoken'
import {
  LTI_CLAIM,
  LTI_MESSAGE_TYPE,
  LTI_VERSION,
  LtiIdTokenClaims,
  isEditorRole
} from './claims'
import { LtiPlatformRegistration } from './platform'
import { Jwk, jwkToPublicKey, selectJwk } from '../utils/jwks'

/** RS256 is what every platform signs with; the siblings are permitted by the framework. */
export const ID_TOKEN_ALGORITHMS = ['RS256', 'RS384', 'RS512'] as const

type IdTokenAlgorithm = (typeof ID_TOKEN_ALGORITHMS)[number]

/** Tolerated clock skew between platform and tool, in seconds. */
const CLOCK_SKEW_SECONDS = 60

export type LtiLaunchErrorCode =
  | 'malformed_token'
  | 'unsupported_algorithm'
  | 'unknown_kid'
  | 'invalid_signature'
  | 'invalid_issuer'
  | 'invalid_audience'
  | 'token_expired'
  | 'invalid_nonce'
  | 'unknown_deployment'
  | 'unsupported_message_type'
  | 'unsupported_version'
  | 'missing_subject'

export class LtiLaunchError extends Error {
  constructor(
    readonly code: LtiLaunchErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'LtiLaunchError'
  }
}

export interface VerifyIdTokenOptions {
  platform: LtiPlatformRegistration
  /** The platform's current key set, fetched from `platform.jwksUri`. */
  keys: Jwk[]
  /** The nonce the tool put in its authentication request; checked for single use by the caller. */
  nonce: string
  now?: Date
}

const isAlgorithm = (value: unknown): value is IdTokenAlgorithm =>
  typeof value === 'string' && (ID_TOKEN_ALGORITHMS as readonly string[]).includes(value)

const audiences = (aud: unknown): string[] =>
  typeof aud === 'string' ? [aud] : Array.isArray(aud) ? aud.filter((value) => typeof value === 'string') : []

/**
 * Verifies a platform's id_token the way the Security Framework requires of a tool
 * (section 5.1.3): signature with the platform's published key, `iss`, `aud` (with `azp`
 * when several audiences are named), `exp`, `iat`, the `nonce` of this launch, and the
 * LTI claims that make it a resource link launch from a known deployment.
 *
 * A tool only ever verifies; it never signs a launch. The platform is the identity
 * provider, and the tool's own key pair exists for the services it calls later.
 */
export function verifyIdToken(idToken: string, options: VerifyIdTokenOptions): LtiIdTokenClaims {
  const decoded = jwt.decode(idToken, { complete: true })
  if (!decoded || typeof decoded === 'string' || typeof decoded.payload !== 'object') {
    throw new LtiLaunchError('malformed_token', 'The id_token is not a JWT.')
  }
  const { alg, kid } = decoded.header
  if (!isAlgorithm(alg)) {
    throw new LtiLaunchError('unsupported_algorithm', `The id_token algorithm "${String(alg)}" is not permitted.`)
  }
  if (typeof kid !== 'string') {
    throw new LtiLaunchError('unknown_kid', 'The id_token names no key id.')
  }
  const jwk = selectJwk(options.keys, kid)
  if (!jwk) {
    throw new LtiLaunchError('unknown_kid', `The platform key set holds no key "${kid}".`)
  }

  const now = Math.floor((options.now ?? new Date()).getTime() / 1000)
  let payload: Record<string, unknown>
  try {
    const verified = jwt.verify(idToken, jwkToPublicKey(jwk), {
      algorithms: [alg],
      ignoreExpiration: true,
      clockTimestamp: now
    })
    if (typeof verified !== 'object' || verified === null) {
      throw new LtiLaunchError('malformed_token', 'The id_token carries no claims.')
    }
    payload = verified as Record<string, unknown>
  } catch (error) {
    if (error instanceof LtiLaunchError) throw error
    throw new LtiLaunchError('invalid_signature', 'The id_token signature does not verify against the platform key.')
  }

  if (payload.iss !== options.platform.issuer) {
    throw new LtiLaunchError('invalid_issuer', 'The id_token was not issued by the expected platform.')
  }
  const aud = audiences(payload.aud)
  if (!aud.includes(options.platform.clientId)) {
    throw new LtiLaunchError('invalid_audience', 'The id_token is not addressed to this tool.')
  }
  if (aud.length > 1 && payload.azp === undefined) {
    throw new LtiLaunchError('invalid_audience', 'The id_token names several audiences without an authorized party.')
  }
  if (payload.azp !== undefined && payload.azp !== options.platform.clientId) {
    throw new LtiLaunchError('invalid_audience', 'The id_token was authorized for another party.')
  }
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS <= now) {
    throw new LtiLaunchError('token_expired', 'The id_token has expired.')
  }
  if (typeof payload.iat !== 'number' || payload.iat - CLOCK_SKEW_SECONDS > now) {
    throw new LtiLaunchError('token_expired', 'The id_token was issued in the future.')
  }
  if (typeof payload.nonce !== 'string' || payload.nonce !== options.nonce) {
    throw new LtiLaunchError('invalid_nonce', 'The id_token does not answer this login.')
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new LtiLaunchError('missing_subject', 'The id_token identifies no user.')
  }
  if (payload[LTI_CLAIM.messageType] !== LTI_MESSAGE_TYPE.resourceLink) {
    throw new LtiLaunchError('unsupported_message_type', `Only ${LTI_MESSAGE_TYPE.resourceLink} launches are supported.`)
  }
  if (payload[LTI_CLAIM.version] !== LTI_VERSION) {
    throw new LtiLaunchError('unsupported_version', `Only LTI ${LTI_VERSION} launches are supported.`)
  }
  const deploymentId = payload[LTI_CLAIM.deploymentId]
  if (typeof deploymentId !== 'string' || !options.platform.deploymentIds.includes(deploymentId)) {
    throw new LtiLaunchError('unknown_deployment', 'The launch comes from a deployment this tool is not registered for.')
  }
  return payload as unknown as LtiIdTokenClaims
}

/** What NodeGrade needs from a launch, named without the claim URIs. */
export interface LtiLaunchIdentity {
  /** Platform-scoped, stable user id (`sub`). */
  userId: string
  roles: string[]
  isInstructor: boolean
  /** The course; absent when the platform launches outside any context. */
  contextId?: string
  contextTitle?: string
  /** The placement of the tool inside the course. */
  resourceLinkId?: string
  resourceLinkTitle?: string
  custom: Record<string, string>
  name?: string
  email?: string
  platformGuid?: string
  platformName?: string
}

const nonEmpty = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined

const displayName = (claims: LtiIdTokenClaims): string | undefined => {
  const full = nonEmpty(claims.name)
  if (full) return full
  const parts = [nonEmpty(claims.given_name), nonEmpty(claims.family_name)].filter(
    (part): part is string => part !== undefined
  )
  return parts.length > 0 ? parts.join(' ') : undefined
}

export function mapLaunchClaims(claims: LtiIdTokenClaims): LtiLaunchIdentity {
  const roles = (claims[LTI_CLAIM.roles] ?? []).filter((role): role is string => typeof role === 'string')
  const context = claims[LTI_CLAIM.context]
  const resourceLink = claims[LTI_CLAIM.resourceLink]
  const platform = claims[LTI_CLAIM.toolPlatform]
  const custom = Object.fromEntries(
    Object.entries(claims[LTI_CLAIM.custom] ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  )
  return {
    userId: claims.sub,
    roles,
    isInstructor: roles.some(isEditorRole),
    contextId: nonEmpty(context?.id),
    contextTitle: nonEmpty(context?.title) ?? nonEmpty(context?.label),
    resourceLinkId: nonEmpty(resourceLink?.id),
    resourceLinkTitle: nonEmpty(resourceLink?.title),
    custom,
    name: displayName(claims),
    email: nonEmpty(claims.email),
    platformGuid: nonEmpty(platform?.guid),
    platformName: nonEmpty(platform?.name)
  }
}
