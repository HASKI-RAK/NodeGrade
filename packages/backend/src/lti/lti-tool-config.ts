import type { Request } from 'express';
import { LTI_MESSAGE_TYPE, LTI_VERSION } from '@haski/lti';

export const LTI_TOOL_TITLE = 'NodeGrade';
const TOOL_DESCRIPTION = 'Automated short-answer assessment with node graphs.';

/**
 * Where the Canvas JSON configuration places the tool: one link in the course
 * navigation, so every launch of a course reaches that course's workspace.
 */
const CANVAS_PLACEMENT = 'course_navigation';

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
    description: TOOL_DESCRIPTION,
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

/**
 * The JSON that Canvas's "Paste JSON" developer key form imports (SPEC-0023/FR-006;
 * Canvas, "Configuring an LTI 1.3 tool"). Canvas reads `privacy_level`, `custom_fields`
 * and its placements from an extension of its own, and ignores the generic
 * configuration above. The placement opens in a new tab because the launch cookie is
 * first-party only (FR-013, docs/lti.md).
 */
export function canvasToolConfiguration(baseUrl: string) {
  const launchUrl = `${baseUrl}/lti/launch`;
  return {
    title: LTI_TOOL_TITLE,
    description: TOOL_DESCRIPTION,
    oidc_initiation_url: `${baseUrl}/lti/login`,
    target_link_uri: launchUrl,
    public_jwk_url: `${baseUrl}/lti/jwks`,
    scopes: [] as string[],
    privacy_level: 'public',
    custom_fields: { activityname: 'default' },
    extensions: [
      {
        platform: 'canvas.instructure.com',
        tool_id: 'nodegrade',
        privacy_level: 'public',
        settings: {
          text: LTI_TOOL_TITLE,
          placements: [
            {
              placement: CANVAS_PLACEMENT,
              message_type: LTI_MESSAGE_TYPE.resourceLink,
              target_link_uri: launchUrl,
              text: LTI_TOOL_TITLE,
              windowTarget: '_blank',
              enabled: true,
            },
          ],
        },
      },
    ],
  };
}
