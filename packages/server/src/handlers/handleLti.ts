/* eslint-disable simple-import-sort/imports */
import prisma from '../client'
import {
  handleToolRegistration,
  isOpenIdConfigJson,
  isPayloadLtiLaunchValid,
  isSuccessfulToolRegistrationResponse,
  LtiBasicLaunchRequest,
  LtiLaunchRequest,
  ToolRegistrationRequest
} from '@haski/lti'
import { IncomingMessage, ServerResponse } from 'http'
import { log } from '../server'

export const handleLtiToolRegistration = async (
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>
) => handleToolRegistration(request, response, savePlatformCallback)

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
  params: URLSearchParams
): LtiBasicLaunchRequest | null => {
  const user_id = parseInt(params.get('user_id') ?? '')
  const lis_person_sourcedid = params.get('lis_person_sourcedid') ?? undefined
  const roles = params.get('roles') ?? ''
  const custom_activityname = params.get('custom_activityname') ?? undefined
  const context_id = parseInt(params.get('context_id') ?? '')
  const context_label = params.get('context_label') ?? ''
  const context_title = params.get('context_title') ?? ''
  const lti_message_type = params.get('lti_message_type') ?? ''
  const resource_link_title = params.get('resource_link_title') ?? ''
  const resource_link_description = params.get('resource_link_description') ?? undefined
  const resource_link_id = parseInt(params.get('resource_link_id') ?? '')
  const context_type = params.get('context_type') ?? ''
  const lis_course_section_sourcedid =
    params.get('lis_course_section_sourcedid') ?? undefined

  // eslint-disable-next-line immutable/no-let
  let lis_result_sourcedid
  try {
    lis_result_sourcedid = params.get('lis_result_sourcedid')
      ? JSON.parse(params.get('lis_result_sourcedid') ?? '')
      : undefined
  } catch {
    return null // Invalid JSON format
  }

  const lis_outcome_service_url = params.get('lis_outcome_service_url') ?? ''
  const lis_person_name_given = params.get('lis_person_name_given') ?? ''
  const lis_person_name_family = params.get('lis_person_name_family') ?? ''
  const lis_person_name_full = params.get('lis_person_name_full') ?? ''
  const ext_user_username = params.get('ext_user_username') ?? ''
  const lis_person_contact_email_primary =
    params.get('lis_person_contact_email_primary') ?? ''
  const launch_presentation_locale = params.get('launch_presentation_locale') ?? ''
  const ext_lms = params.get('ext_lms') ?? ''
  const tool_consumer_info_product_family_code =
    params.get('tool_consumer_info_product_family_code') ?? ''
  const tool_consumer_info_version = params.get('tool_consumer_info_version') ?? ''
  const oauth_callback = params.get('oauth_callback') ?? ''
  const lti_version = params.get('lti_version') ?? ''
  const tool_consumer_instance_guid = params.get('tool_consumer_instance_guid') ?? ''
  const tool_consumer_instance_name = params.get('tool_consumer_instance_name') ?? ''
  const tool_consumer_instance_description =
    params.get('tool_consumer_instance_description') ?? ''
  const launch_presentation_document_target =
    params.get('launch_presentation_document_target') ?? ''
  const launch_presentation_return_url =
    params.get('launch_presentation_return_url') ?? ''

  if (
    !isNaN(user_id) &&
    roles &&
    !isNaN(context_id) &&
    context_label &&
    context_title &&
    lti_message_type &&
    resource_link_title &&
    !isNaN(resource_link_id) &&
    context_type &&
    lis_result_sourcedid &&
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
    const payload: LtiBasicLaunchRequest = {
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
    return payload
  }

  return null
}

export type { ToolRegistrationRequest }
