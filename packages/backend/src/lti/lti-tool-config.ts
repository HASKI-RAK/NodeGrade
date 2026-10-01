import type { Request } from 'express';
import { LTI_MESSAGE_TYPE, LTI_VERSION } from '@haski/lti';

export const LTI_TOOL_TITLE = 'NodeGrade';

/**
 * The base URL under which the platform reaches the tool's /lti routes.
 *
 * The request origin is right whenever the admin registered the URL the platform just
 * called; `trust proxy` makes `protocol` and `host` the public ones behind nginx and
 * Traefik. LTI_TOOL_URL overrides it for a deployment whose public origin a proxy
 * rewrites.
 */
export function toolBaseUrl(
  request: Pick<Request, 'protocol' | 'get'>,
  configured: string | undefined = process.env.LTI_TOOL_URL,
): string {
  const base =
    configured && configured.trim().length > 0
      ? configured.trim()
      : `${request.protocol}://${request.get('host') ?? 'localhost'}`;
  return base.replace(/\/+$/, '');
}

/**
 * What an LMS admin pastes when registering NodeGrade (SPEC-0023/FR-006): the three
 * URLs every platform asks for, plus the fields Canvas reads from a JSON
 * configuration. `scopes` is empty because the tool requests no service yet.
 */
export function ltiToolConfiguration(baseUrl: string) {
  const launchUrl = `${baseUrl}/lti/launch`;
  return {
    title: LTI_TOOL_TITLE,
    description: 'Automated short-answer assessment with node graphs.',
    lti_version: LTI_VERSION,
    oidc_initiation_url: `${baseUrl}/lti/login`,
    target_link_uri: launchUrl,
    redirect_uris: [launchUrl],
    public_jwk_url: `${baseUrl}/lti/jwks`,
    scopes: [] as string[],
    claims: ['iss', 'sub', 'name', 'given_name', 'family_name', 'email'],
    messages: [
      { type: LTI_MESSAGE_TYPE.resourceLink, target_link_uri: launchUrl },
    ],
    custom_parameters: {
      activityname:
        'Optional. Name of the legacy graph to start a new course workspace from; defaults to "default".',
    },
    legacy: {
      lti_1_1_launch_url: `${baseUrl}/lti/basiclogin`,
    },
  };
}
