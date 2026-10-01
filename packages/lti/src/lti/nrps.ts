import { LTI_CLAIM } from './claims'

/**
 * Names and Role Provisioning Services (LTI NRPS 2.0): the launch tells the tool where
 * the course roster is. Reading the roster needs a service access token the tool
 * obtains with its own key pair, which NodeGrade does not request yet; this module
 * only makes the advertised endpoint available to a later implementation.
 */
export const NRPS_SCOPE = 'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly'

export const NRPS_MEMBERSHIP_MEDIA_TYPE =
  'application/vnd.ims.lti-nrps.v2.membershipcontainer+json'

export interface LtiNamesRoleServiceClaim {
  context_memberships_url: string
  service_versions: string[]
}

export function readNamesRoleServiceClaim(
  claims: Record<string, unknown>
): LtiNamesRoleServiceClaim | undefined {
  const claim = claims[LTI_CLAIM.namesRoleService]
  if (typeof claim !== 'object' || claim === null) return undefined
  const { context_memberships_url, service_versions } = claim as Partial<LtiNamesRoleServiceClaim>
  if (typeof context_memberships_url !== 'string') return undefined
  return {
    context_memberships_url,
    service_versions: Array.isArray(service_versions)
      ? service_versions.filter((version): version is string => typeof version === 'string')
      : []
  }
}
