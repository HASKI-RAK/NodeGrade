import jwt from 'jsonwebtoken'

export interface LtiLaunchRequest {
  iss: string
  login_hint: string
  target_link_uri: string
  lti_message_hint?: string
  lti_deployment_id: string
}

export function handleLaunchRequest(body: LtiLaunchRequest, key: string): string {
  // Create the JWT payload
  const payload = {
    iss: body.iss,
    login_hint: body.login_hint,
    target_link_uri: body.target_link_uri,
    lti_message_hint: body.lti_message_hint,
    lti_deployment_id: body.lti_deployment_id
  }

  // Sign the JWT
  const token = jwt.sign(payload, key, { algorithm: 'RS256' })

  return token
}
