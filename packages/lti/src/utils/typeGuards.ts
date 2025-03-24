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
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.user_id === 'number' &&
    (typeof value.lis_person_sourcedid === 'string' ||
      value.lis_person_sourcedid === undefined) &&
    typeof value.roles === 'string' &&
    typeof value.context_id === 'number' &&
    typeof value.context_label === 'string' &&
    typeof value.context_title === 'string' &&
    typeof value.lti_message_type === 'string' &&
    typeof value.resource_link_title === 'string' &&
    (typeof value.resource_link_description === 'string' ||
      value.resource_link_description === undefined) &&
    typeof value.resource_link_id === 'number' &&
    typeof value.context_type === 'string' &&
    (typeof value.lis_course_section_sourcedid === 'string' ||
      value.lis_course_section_sourcedid === undefined) &&
    typeof value.lis_result_sourcedid === 'object' &&
    value.lis_result_sourcedid !== null &&
    typeof value.lis_result_sourcedid.data === 'object' &&
    value.lis_result_sourcedid.data !== null &&
    typeof value.lis_result_sourcedid.data.instanceid === 'string' &&
    typeof value.lis_result_sourcedid.data.userid === 'string' &&
    (typeof value.lis_result_sourcedid.data.typeid === 'string' ||
      value.lis_result_sourcedid.data.typeid === null) &&
    typeof value.lis_result_sourcedid.data.launchid === 'number' &&
    typeof value.lis_result_sourcedid.hash === 'string' &&
    typeof value.lis_outcome_service_url === 'string' &&
    typeof value.lis_person_name_given === 'string' &&
    typeof value.lis_person_name_family === 'string' &&
    typeof value.lis_person_name_full === 'string' &&
    typeof value.ext_user_username === 'string' &&
    typeof value.lis_person_contact_email_primary === 'string' &&
    typeof value.launch_presentation_locale === 'string' &&
    typeof value.ext_lms === 'string' &&
    typeof value.tool_consumer_info_product_family_code === 'string' &&
    typeof value.tool_consumer_info_version === 'string' &&
    typeof value.oauth_callback === 'string' &&
    typeof value.lti_version === 'string' &&
    typeof value.tool_consumer_instance_guid === 'string' &&
    typeof value.tool_consumer_instance_name === 'string' &&
    typeof value.tool_consumer_instance_description === 'string' &&
    typeof value.launch_presentation_document_target === 'string' &&
    typeof value.launch_presentation_return_url === 'string'
  )
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
