// src/toolRegistration.ts

import { IncomingMessage, ServerResponse } from 'http'

export interface ToolRegistrationRequest {
  client_id: string
  initiate_login_uri: string
  redirect_uris: string[]
  jwks_uri: string
}

export interface ToolRegistrationResponse {
  registration_status: string
  client_id: string
  client_secret: string
}

// https://www.imsglobal.org/spec/lti-dr/v1p0#successful-registration
export interface SuccessfulToolRegistrationResponse {
  client_id: string
  response_types: string[]
  jwks_uri: string
  initiate_login_uri: string
  grant_types: string[]
  redirect_uris: string[]
  application_type: string
  token_endpoint_auth_method: string
  client_name: string
  logo_uri: string
  scope: string
  'https://purl.imsglobal.org/spec/lti-tool-configuration': LtiToolConfiguration
  scopes_supported: string[]
  response_types_supported: string[]
  subject_types_supported: string[]
  id_token_signing_alg_values_supported: string[]
  claims_supported: string[]
}

// sub-interface of LtiToolConfiguration
interface LtiToolConfiguration {
  version: string
  deployment_id: string
  target_link_uri: string
  domain: string
  description: string
  claims: string[]
}

export interface OpenIdConfigJson {
  issuer: string
  authorization_endpoint: string
  registration_endpoint: string
  'https://purl.imsglobal.org/spec/lti-platform-configuration': {
    product_family_code: string
    version: string
    variables: string[]
  }
}

export interface LtiLaunchRequest {
  iss: string
  target_link_uri: string
  login_hint: string
  lti_message_hint: string
  client_id: string
  lti_deployment_id: string
}

export interface LtiBasicLaunchRequest {
  user_id: string
  lis_person_sourcedid?: string
  roles: string
  custom_activityname?: string // custom parameter specified in the LMS under "Custom Parameters". This is the name of the graph to load
  context_id: string
  context_label: string
  context_title: string
  lti_message_type: string
  resource_link_title: string
  resource_link_description?: string
  resource_link_id: string
  context_type: string
  lis_course_section_sourcedid?: string
  lis_result_sourcedid: {
    data: {
      instanceid: string
      userid: string
      typeid: string | null
      launchid: string
    }
    hash: string
  }
  lis_outcome_service_url: string
  lis_person_name_given: string
  lis_person_name_family: string
  lis_person_name_full: string
  ext_user_username: string
  lis_person_contact_email_primary: string
  launch_presentation_locale: string
  ext_lms: string
  tool_consumer_info_product_family_code: string
  tool_consumer_info_version: string
  oauth_callback: string
  lti_version: string
  tool_consumer_instance_guid: string
  tool_consumer_instance_name: string
  tool_consumer_instance_description: string
  launch_presentation_document_target: string
  launch_presentation_return_url: string
}

// Dummy storage for registered tools

export async function handleToolRegistration(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  savePlatformCallback: (
    toolRegistrationData: SuccessfulToolRegistrationResponse,
    openIdConfigJson: unknown
  ) => Promise<void>
) {
  try {
    const params = new URLSearchParams(request.url?.split('?')[1])
    const openid_configuration = params.get('openid_configuration') // https://www.imsglobal.org/spec/lti-dr/v1p0#openid-configuration
    const registration_token = params.get('registration_token')
    // visit with get request openID configuration endpoint to retreieve registration endpoint:
    const { registrationResponse, openIdConfigJson } = await getRegistrationEndpoint(
      openid_configuration,
      registration_token
    )

    // write platform registration to database
    savePlatformCallback(registrationResponse, openIdConfigJson).then(() => {
      response.end(JSON.stringify(registrationResponse))
    })
  } catch (error) {
    throw new Error('Could not register tool: ' + error)
  }
}

const getRegistrationEndpoint = async (
  openid_configuration: string | null,
  registration_token: string | null
) => {
  // visit with get request openID configuration endpoint to retreieve registration endpoint:
  if (openid_configuration) {
    const registration_endpoint = await fetch(openid_configuration)
    // https://www.imsglobal.org/spec/lti-dr/v1p0#openid-configuration
    const registration_endpoint_json = await registration_endpoint.json()
    const open_id_registration_endpoint_url =
      registration_endpoint_json.registration_endpoint

    //TODO: check harmfull input

    // visit registration_endpoint with post request to register the tool
    // https://www.imsglobal.org/spec/lti-dr/v1p0#lti-open-id-connect-dynamic-registration-protocol
    const registration_response = await fetch(open_id_registration_endpoint_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${registration_token}`
      },
      // https://www.imsglobal.org/spec/lti-dr/v1p0#openid-configuration-0
      body: JSON.stringify({
        application_type: 'web',
        grant_types: ['client_credentials', 'implicit'],
        response_types: ['id_token'],
        client_name: 'Task Assessment',
        'client_name#de': 'Aufgabenbewertung',
        redirect_uris: [
          'http://localhost:5173/ws/editor/lol/1/2',
          'http://localhost:5000',
          'http://localhost:5000/v1/lti/register',
          'http://localhost:5173',
          'http://localhost:5173/lti/register'
        ],
        policy_uri: 'http://localhost:5000/policy',
        'policy_uri#de': 'http://localhost:5000/policy',
        initiate_login_uri: 'http://localhost:5173/lti/login',
        jwks_uri: 'http://localhost:5000/.well-known/jwks',
        token_endpoint_auth_method: 'private_key_jwt',
        scope:
          'https://purl.imsglobal.org/spec/lti-ags/scope/score https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
        'https://purl.imsglobal.org/spec/lti-tool-configuration': {
          // https://www.imsglobal.org/spec/lti-dr/v1p0#lti-configuration-0
          domain: 'http://localhost:5173',
          description: 'Automated short answer assessment',
          target_link_uri: 'http://localhost:5173/lti/login', //TODO: set to frontend url
          claims: ['iss', 'sub', 'name', 'given_name'], // 	An array of claims indicating which information this tool desire to be included in each idtoken
          messages: [
            {
              type: 'LtiDeepLinkingRequest',
              target_link_uri: 'http://localhost:5173/lti/deeplink',
              label:
                'Select the graph template for this exercise. Also enter the question for the exercise.',
              'label#de':
                'Wählen Sie die Graphenvorlage für diese Übung aus. Geben Sie zudem die Frage für die Übung ein.',
              custom_parameters: {
                botanical_set: '12943,49023,50013'
              },
              placements: ['ContentArea'],
              supported_types: ['ltiResourceLink']
            }
          ]
        }
      })
    }).then((response) => {
      if (!response.ok) {
        // throw new Error('Could not register tool: ' + response.statusText)
      } else {
        return response.json()
      }
    })
    return {
      registrationResponse: registration_response,
      openIdConfigJson: registration_endpoint_json
    }
  } else {
    throw new Error('Invalid OpenID Configuration')
  }
}
