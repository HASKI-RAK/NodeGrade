/* eslint-disable simple-import-sort/imports */
import prisma from '../client'
import {
  handleToolRegistration,
  isOpenIdConfigJson,
  isPayloadLtiLaunchValid,
  isSuccessfulToolRegistrationResponse,
  LtiBasicLaunchRequest,
  LtiLaunchRequest,
  SuccessfulToolRegistrationResponse,
  ToolRegistrationRequest
} from '@haski/lti'
import { IncomingMessage, ServerResponse } from 'http'
import { log } from '../server'

// Extend IncomingMessage to include body
interface ExtendedIncomingMessage extends IncomingMessage {
  body?: any
}

export const handleLtiToolRegistration = async (
  request: ExtendedIncomingMessage,
  response: ServerResponse<IncomingMessage>
) => {
  try {
    // Check if it's a student launch request before handling registration
    if (request.body?.roles === 'Learner' && request.body?.custom_activityname) {
      response.writeHead(302, {
        Location: `/ws/student/${request.body.custom_activityname}`
      })
      response.end()
      return
    }

    // Handle tool registration if not a student launch
    const result = await handleToolRegistration(request, response, savePlatformCallback)
    return
  } catch (error) {
    log.error('Error in handleLtiToolRegistration:', error)
    response.writeHead(500, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: 'Registration failed' }))
  }
}

const savePlatformCallback = async (
  toolRegistrationResponse: unknown,
  openIdConfigJson: unknown
) => {
  if (!isSuccessfulToolRegistrationResponse(toolRegistrationResponse)) {
    throw new Error('Invalid body parameter')
  }
  if (!isOpenIdConfigJson(openIdConfigJson)) {
    throw new Error('Invalid openIdConfigJson parameter')
  }
  await prisma.ltiPlatform
    .create({
      data: {
        clientId: toolRegistrationResponse.client_id,
        clientRegistration: {
          create: {
            clientId: toolRegistrationResponse.client_id,
            responseTypes: toolRegistrationResponse.response_types,
            jwksUri: toolRegistrationResponse.jwks_uri,
            initiateLoginUri: toolRegistrationResponse.initiate_login_uri,
            grantTypes: toolRegistrationResponse.grant_types,
            redirectUris: toolRegistrationResponse.redirect_uris,
            applicationType: toolRegistrationResponse.application_type,
            tokenEndpointAuthMethod: toolRegistrationResponse.token_endpoint_auth_method,
            clientName: toolRegistrationResponse.client_name,
            logoUri: toolRegistrationResponse.logo_uri,
            scope: toolRegistrationResponse.scope,
            ltiToolConfiguration: JSON.stringify(
              toolRegistrationResponse[
                'https://purl.imsglobal.org/spec/lti-tool-configuration'
              ]
            )
          }
        },
        issuer: openIdConfigJson.issuer,
        jwksUri: toolRegistrationResponse.jwks_uri,
        authorizationEndpoint: openIdConfigJson.authorization_endpoint,
        registrationEndpoint: openIdConfigJson.registration_endpoint,
        scopesSupported: toolRegistrationResponse.scopes_supported,
        responseTypesSupported: toolRegistrationResponse.response_types_supported,
        subjectTypesSupported: toolRegistrationResponse.subject_types_supported,
        idTokenSigningAlgValuesSupported:
          toolRegistrationResponse.id_token_signing_alg_values_supported,
        claimsSupported: toolRegistrationResponse.claims_supported,
        productFamilyCode:
          openIdConfigJson['https://purl.imsglobal.org/spec/lti-platform-configuration']
            .product_family_code,
        version:
          openIdConfigJson['https://purl.imsglobal.org/spec/lti-platform-configuration']
            .version,
        variables:
          openIdConfigJson['https://purl.imsglobal.org/spec/lti-platform-configuration']
            .variables
      }
    })
    .then((platform) => {
      log.info('Platform created: ', platform)
    })
    .catch((e) => {
      log.error(e)
    })
}

export const extractLtiLaunchRequest = (
  params: URLSearchParams
): LtiLaunchRequest | null => {
  const iss = params.get('iss')
  const target_link_uri = params.get('target_link_uri')
  const login_hint = params.get('login_hint')
  const lti_message_hint = params.get('lti_message_hint')
  const client_id = params.get('client_id')
  const lti_deployment_id = params.get('lti_deployment_id')

  if (
    iss &&
    target_link_uri &&
    login_hint &&
    lti_message_hint &&
    client_id &&
    lti_deployment_id
  ) {
    const payload = {
      iss,
      target_link_uri,
      login_hint,
      lti_message_hint,
      client_id,
      lti_deployment_id
    }

    if (isPayloadLtiLaunchValid(payload)) {
      return payload
    }
  }

  return null
}

export const extractBasicLtiLaunchRequest = (
  params: URLSearchParams | Record<string, any>
): LtiBasicLaunchRequest | null => {
  // Handle both URLSearchParams and direct object input
  const getValue = (key: string) => {
    let value
    if (params instanceof URLSearchParams) {
      value = params.get(key)
      if (value === null) return undefined

      // Special handling for version format
      if (key === 'tool_consumer_info_version' && value === '1') {
        return '1.0'
      }

      // Try to parse JSON string values
      try {
        if (value.startsWith('{') || value.startsWith('[')) {
          return JSON.parse(value)
        }
      } catch {
        // If JSON parsing fails, return the original value
      }
      return value
    }

    value = params[key]
    // Handle direct object input similarly
    if (key === 'tool_consumer_info_version' && value === '1') {
      return '1.0'
    }
    return value
  }

  // Extract and validate all fields
  const user_id = parseInt(String(getValue('user_id') ?? ''))
  const lis_person_sourcedid = getValue('lis_person_sourcedid')
  const roles = String(getValue('roles') ?? '')
  const custom_activityname = getValue('custom_activityname')
  const context_id = parseInt(String(getValue('context_id') ?? ''))
  const context_label = String(getValue('context_label') ?? '')
  const context_title = String(getValue('context_title') ?? '')
  const lti_message_type = String(getValue('lti_message_type') ?? '')
  const resource_link_title = String(getValue('resource_link_title') ?? '')
  const resource_link_description = getValue('resource_link_description')
  const resource_link_id = parseInt(String(getValue('resource_link_id') ?? ''))
  const context_type = String(getValue('context_type') ?? '')
  const lis_course_section_sourcedid = getValue('lis_course_section_sourcedid')
  const lis_result_sourcedid = getValue('lis_result_sourcedid')
  const lis_outcome_service_url = String(getValue('lis_outcome_service_url') ?? '')
  const lis_person_name_given = String(getValue('lis_person_name_given') ?? '')
  const lis_person_name_family = String(getValue('lis_person_name_family') ?? '')
  const lis_person_name_full = String(getValue('lis_person_name_full') ?? '')
  const ext_user_username = String(getValue('ext_user_username') ?? '')
  const lis_person_contact_email_primary = String(
    getValue('lis_person_contact_email_primary') ?? ''
  )
  const launch_presentation_locale = String(getValue('launch_presentation_locale') ?? '')
  const ext_lms = String(getValue('ext_lms') ?? '')
  const tool_consumer_info_product_family_code = String(
    getValue('tool_consumer_info_product_family_code') ?? ''
  )
  const tool_consumer_info_version = String(getValue('tool_consumer_info_version') ?? '')
  const oauth_callback = String(getValue('oauth_callback') ?? '')
  const lti_version = String(getValue('lti_version') ?? '')
  const tool_consumer_instance_guid = String(
    getValue('tool_consumer_instance_guid') ?? ''
  )
  const tool_consumer_instance_name = String(
    getValue('tool_consumer_instance_name') ?? ''
  )
  const tool_consumer_instance_description = String(
    getValue('tool_consumer_instance_description') ?? ''
  )
  const launch_presentation_document_target = String(
    getValue('launch_presentation_document_target') ?? ''
  )
  const launch_presentation_return_url = String(
    getValue('launch_presentation_return_url') ?? ''
  )

  // Validate all required fields
  if (
    !isNaN(user_id) &&
    roles &&
    !isNaN(context_id) &&
    context_label &&
    context_title &&
    lti_message_type === 'basic-lti-launch-request' &&
    resource_link_title &&
    !isNaN(resource_link_id) &&
    context_type &&
    lis_result_sourcedid &&
    typeof lis_result_sourcedid === 'object' &&
    lis_result_sourcedid.data &&
    lis_result_sourcedid.hash &&
    lis_outcome_service_url &&
    lis_person_name_given &&
    lis_person_name_family &&
    lis_person_name_full &&
    ext_user_username &&
    lis_person_contact_email_primary &&
    launch_presentation_locale &&
    ext_lms &&
    tool_consumer_info_product_family_code &&
    tool_consumer_info_version &&
    oauth_callback &&
    lti_version &&
    tool_consumer_instance_guid &&
    tool_consumer_instance_name &&
    tool_consumer_instance_description &&
    launch_presentation_document_target &&
    launch_presentation_return_url
  ) {
    return {
      user_id,
      lis_person_sourcedid,
      roles,
      custom_activityname,
      context_id,
      context_label,
      context_title,
      lti_message_type,
      resource_link_title,
      resource_link_description,
      resource_link_id,
      context_type,
      lis_course_section_sourcedid,
      lis_result_sourcedid,
      lis_outcome_service_url,
      lis_person_name_given,
      lis_person_name_family,
      lis_person_name_full,
      ext_user_username,
      lis_person_contact_email_primary,
      launch_presentation_locale,
      ext_lms,
      tool_consumer_info_product_family_code,
      tool_consumer_info_version,
      oauth_callback,
      lti_version,
      tool_consumer_instance_guid,
      tool_consumer_instance_name,
      tool_consumer_instance_description,
      launch_presentation_document_target,
      launch_presentation_return_url
    }
  }

  return null
}

export type { LtiBasicLaunchRequest, LtiLaunchRequest, ToolRegistrationRequest }
