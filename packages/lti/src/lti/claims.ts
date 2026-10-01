/**
 * LTI 1.3 claim names, message types and the role vocabulary.
 *
 * An LTI 1.3 launch is an OpenID Connect id_token whose LTI content lives in claims
 * named by URI (LTI Core 1.3, section 4 and 5; https://www.imsglobal.org/spec/lti/v1p3).
 * Nothing else in the repository spells these URIs out.
 */
export const LTI_CLAIM = {
  messageType: 'https://purl.imsglobal.org/spec/lti/claim/message_type',
  version: 'https://purl.imsglobal.org/spec/lti/claim/version',
  deploymentId: 'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
  targetLinkUri: 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri',
  resourceLink: 'https://purl.imsglobal.org/spec/lti/claim/resource_link',
  context: 'https://purl.imsglobal.org/spec/lti/claim/context',
  roles: 'https://purl.imsglobal.org/spec/lti/claim/roles',
  custom: 'https://purl.imsglobal.org/spec/lti/claim/custom',
  launchPresentation: 'https://purl.imsglobal.org/spec/lti/claim/launch_presentation',
  toolPlatform: 'https://purl.imsglobal.org/spec/lti/claim/tool_platform',
  lis: 'https://purl.imsglobal.org/spec/lti/claim/lis',
  /** Carried by a platform migrated from 1.1 (LTI 1.3 migration guide). */
  lti1p1: 'https://purl.imsglobal.org/spec/lti/claim/lti1p1',
  agsEndpoint: 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint',
  namesRoleService: 'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice',
  deepLinkingSettings: 'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings',
  deepLinkingContentItems: 'https://purl.imsglobal.org/spec/lti-dl/claim/content_items',
  deepLinkingData: 'https://purl.imsglobal.org/spec/lti-dl/claim/data'
} as const

export const LTI_MESSAGE_TYPE = {
  resourceLink: 'LtiResourceLinkRequest',
  deepLinkingRequest: 'LtiDeepLinkingRequest',
  deepLinkingResponse: 'LtiDeepLinkingResponse'
} as const

export const LTI_VERSION = '1.3.0'

/** Role vocabulary roots (LTI Core 1.3, appendix A.2). */
export const LTI_ROLE_VOCABULARY = {
  system: 'http://purl.imsglobal.org/vocab/lis/v2/system/person',
  institution: 'http://purl.imsglobal.org/vocab/lis/v2/institution/person',
  membership: 'http://purl.imsglobal.org/vocab/lis/v2/membership'
} as const

export const LTI_ROLE = {
  instructor: `${LTI_ROLE_VOCABULARY.membership}#Instructor`,
  learner: `${LTI_ROLE_VOCABULARY.membership}#Learner`,
  contextAdministrator: `${LTI_ROLE_VOCABULARY.membership}#Administrator`,
  institutionAdministrator: `${LTI_ROLE_VOCABULARY.institution}#Administrator`,
  institutionInstructor: `${LTI_ROLE_VOCABULARY.institution}#Instructor`,
  systemAdministrator: `${LTI_ROLE_VOCABULARY.system}#Administrator`
} as const

export interface LtiContextClaim {
  id: string
  label?: string
  title?: string
  type?: string[]
}

export interface LtiResourceLinkClaim {
  id: string
  title?: string
  description?: string
}

export interface LtiToolPlatformClaim {
  guid?: string
  name?: string
  version?: string
  product_family_code?: string
  url?: string
  contact_email?: string
  description?: string
}

export interface LtiLaunchPresentationClaim {
  document_target?: string
  return_url?: string
  locale?: string
  height?: number
  width?: number
}

export interface Lti1p1MigrationClaim {
  user_id?: string
  oauth_consumer_key?: string
  oauth_consumer_key_sign?: string
}

/** The id_token of a resource link launch after verification. */
export interface LtiIdTokenClaims {
  iss: string
  sub: string
  aud: string | string[]
  azp?: string
  exp: number
  iat: number
  nonce: string
  name?: string
  given_name?: string
  family_name?: string
  email?: string
  [LTI_CLAIM.messageType]: string
  [LTI_CLAIM.version]: string
  [LTI_CLAIM.deploymentId]: string
  [LTI_CLAIM.targetLinkUri]?: string
  [LTI_CLAIM.resourceLink]?: LtiResourceLinkClaim
  [LTI_CLAIM.context]?: LtiContextClaim
  [LTI_CLAIM.roles]?: string[]
  [LTI_CLAIM.custom]?: Record<string, string>
  [LTI_CLAIM.launchPresentation]?: LtiLaunchPresentationClaim
  [LTI_CLAIM.toolPlatform]?: LtiToolPlatformClaim
  [LTI_CLAIM.lti1p1]?: Lti1p1MigrationClaim
  [claim: string]: unknown
}

/** LTI 1.1 role URN roots (LTI 1.1 implementation guide, appendix A; LIS vocabularies). */
const LTI_11_ROLE_URN = {
  context: 'urn:lti:role:ims/lis/',
  institution: 'urn:lti:instrole:ims/lis/',
  system: 'urn:lti:sysrole:ims/lis/'
} as const

/**
 * Whether a role grants the editor view.
 *
 * A context (membership) role is what the launch is about: `Instructor`, its sub-roles
 * (`membership/Instructor#TeachingAssistant` in 1.3, `role:ims/lis/Instructor/...` in
 * 1.1) and the context `Administrator` edit. Institution and system administrators edit
 * because they administer the platform the course lives in. An institution-level
 * `Instructor` only says what the person is elsewhere, so it does not, in either
 * vocabulary: someone who teaches another course and learns in this one stays a learner
 * here. Bare `Instructor` and `Administrator` are accepted for platforms that send short
 * names; every other URN or URI is not an editor.
 */
export function isEditorRole(role: string): boolean {
  if (role === LTI_ROLE.instructor || role === LTI_ROLE.contextAdministrator) return true
  if (role.startsWith(`${LTI_ROLE_VOCABULARY.membership}/Instructor#`)) return true
  if (role === LTI_ROLE.institutionAdministrator || role === LTI_ROLE.systemAdministrator)
    return true
  if (role.startsWith('http://') || role.startsWith('https://')) return false
  if (role.startsWith(LTI_11_ROLE_URN.context)) {
    const name = role.slice(LTI_11_ROLE_URN.context.length)
    return name === 'Instructor' || name === 'Administrator' || name.startsWith('Instructor/')
  }
  if (role.startsWith('urn:')) {
    return (
      role === `${LTI_11_ROLE_URN.institution}Administrator` ||
      role === `${LTI_11_ROLE_URN.system}Administrator`
    )
  }
  return role === 'Instructor' || role === 'Administrator'
}
