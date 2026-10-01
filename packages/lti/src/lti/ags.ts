import { LTI_CLAIM } from './claims'

/**
 * Assignment and Grade Services (LTI AGS 2.0): the launch tells the tool where the
 * gradebook column for this resource link is and which scopes it may ask for. Writing
 * a score needs a service access token the tool obtains with its own key pair, which
 * NodeGrade does not request yet; this module only reads the advertised endpoints.
 */
export const AGS_SCOPE = {
  lineItem: 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
  lineItemReadOnly: 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
  resultReadOnly: 'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
  score: 'https://purl.imsglobal.org/spec/lti-ags/scope/score'
} as const

export const AGS_SCORE_MEDIA_TYPE = 'application/vnd.ims.lis.v1.score+json'

export interface LtiAgsEndpointClaim {
  scope: string[]
  /** The line item container of the context; present when the tool may list or create columns. */
  lineitems?: string
  /** The column bound to this resource link; present when the platform created one. */
  lineitem?: string
}

export function readAgsEndpointClaim(
  claims: Record<string, unknown>
): LtiAgsEndpointClaim | undefined {
  const claim = claims[LTI_CLAIM.agsEndpoint]
  if (typeof claim !== 'object' || claim === null) return undefined
  const { scope, lineitems, lineitem } = claim as Partial<LtiAgsEndpointClaim>
  return {
    scope: Array.isArray(scope) ? scope.filter((entry): entry is string => typeof entry === 'string') : [],
    lineitems: typeof lineitems === 'string' ? lineitems : undefined,
    lineitem: typeof lineitem === 'string' ? lineitem : undefined
  }
}
