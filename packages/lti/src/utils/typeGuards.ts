import {
  LtiBasicLaunchRequest,
  LtiLaunchRequest,
  OpenIdConfigJson,
  SuccessfulToolRegistrationResponse,
  ToolRegistrationRequest
} from '@haski/lti'
export const isPayloadToolRegistrationValid = (
  payload: unknown
): payload is ToolRegistrationRequest => {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'client_id' in payload &&
    'initiate_login_uri' in payload &&
    'redirect_uris' in payload &&
    'jwks_uri' in payload
  )
}

export const isPayloadLtiLaunchValid = (
  payload: unknown
): payload is LtiLaunchRequest => {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'iss' in payload &&
    'target_link_uri' in payload &&
    'login_hint' in payload &&
    'lti_message_hint' in payload &&
    'client_id' in payload &&
    'lti_deployment_id' in payload
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isBasicLtiLaunchValid(value: any): value is LtiBasicLaunchRequest {
  const requiredProps = [
    'user_id',
    'roles',
    'context_id',
    'context_label',
    'context_title',
    'lti_message_type',
    'resource_link_title',
    'resource_link_id',
    'context_type'
  ]

  // Check if value exists and is an object
  if (typeof value !== 'object' || value === null) {
    return false
  }

  // Check if all required properties exist and have correct types
  for (const prop of requiredProps) {
    if (!(prop in value)) {
      return false
    }
  }

  // Check specific property types and constraints
  if (
    typeof value.user_id !== 'number' ||
    typeof value.roles !== 'string' ||
    typeof value.context_id !== 'number' ||
    typeof value.context_label !== 'string' ||
    typeof value.context_title !== 'string' ||
    typeof value.lti_message_type !== 'string' ||
    value.lti_message_type !== 'basic-lti-launch-request' ||
    typeof value.resource_link_title !== 'string' ||
    typeof value.resource_link_id !== 'number' ||
    typeof value.context_type !== 'string'
  ) {
    return false
  }

  return true
}

export function isSuccessfulToolRegistrationResponse(
  payload: unknown
): payload is SuccessfulToolRegistrationResponse {
  if (typeof payload !== 'object' || payload === null) return false
  const requiredFields = [
    'client_id',
    'response_types',
    'jwks_uri',
    'initiate_login_uri',
    'grant_types',
    'redirect_uris',
    'application_type',
    'token_endpoint_auth_method',
    'client_name',
    'https://purl.imsglobal.org/spec/lti-tool-configuration'
  ]
  return requiredFields.every((field) => field in payload)
}
export function isOpenIdConfigJson(payload: unknown): payload is OpenIdConfigJson {
  if (typeof payload !== 'object' || payload === null) return false
  const requiredFields = [
    'issuer',
    'https://purl.imsglobal.org/spec/lti-platform-configuration'
  ]
  return requiredFields.every((field) => field in payload)
}
