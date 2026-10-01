import type { Request } from 'express';
import {
  canvasToolConfiguration,
  ltiToolConfiguration,
  toolBaseUrl,
} from './lti-tool-config.js';

/** Express's `get` is overloaded (`set-cookie` yields an array), so the double is too. */
const headerReader = (host: string | undefined): Request['get'] => {
  function get(name: 'set-cookie'): string[] | undefined;
  function get(name: string): string | undefined;
  function get(name: string): string | string[] | undefined {
    return name === 'host' ? host : undefined;
  }
  return get;
};

const request = (
  protocol: string,
  host: string | undefined,
): Pick<Request, 'protocol' | 'get'> => ({ protocol, get: headerReader(host) });

describe('toolBaseUrl', () => {
  it('derives the origin the platform called, port included', () => {
    expect(toolBaseUrl(request('http', 'localhost:8080'), undefined)).toBe('http://localhost:8080');
    expect(toolBaseUrl(request('https', 'grade.example.org'), '')).toBe('https://grade.example.org');
  });

  it('lets LTI_TOOL_URL override a proxied origin, without a trailing slash', () => {
    expect(toolBaseUrl(request('http', 'backend:5000'), 'https://grade.example.org/ ')).toBe(
      'https://grade.example.org',
    );
  });
});

describe('ltiToolConfiguration', () => {
  it('names the login, launch and key set URLs (FR-006)', () => {
    const config = ltiToolConfiguration('https://grade.example.org');

    expect(config).toMatchObject({
      title: 'NodeGrade',
      lti_version: '1.3.0',
      oidc_initiation_url: 'https://grade.example.org/lti/login',
      target_link_uri: 'https://grade.example.org/lti/launch',
      redirect_uris: ['https://grade.example.org/lti/launch'],
      public_jwk_url: 'https://grade.example.org/lti/jwks',
      legacy: { lti_1_1_launch_url: 'https://grade.example.org/lti/basiclogin' },
    });
  });
});

describe('canvasToolConfiguration', () => {
  it('answers the shape the Canvas developer key form imports (FR-006)', () => {
    const config = canvasToolConfiguration('https://grade.example.org');

    expect(config).toEqual({
      title: 'NodeGrade',
      description: 'Automated short-answer assessment with node graphs.',
      oidc_initiation_url: 'https://grade.example.org/lti/login',
      target_link_uri: 'https://grade.example.org/lti/launch',
      public_jwk_url: 'https://grade.example.org/lti/jwks',
      scopes: [],
      privacy_level: 'public',
      custom_fields: { activityname: 'default' },
      extensions: [
        {
          platform: 'canvas.instructure.com',
          tool_id: 'nodegrade',
          privacy_level: 'public',
          settings: {
            text: 'NodeGrade',
            placements: [
              {
                placement: 'course_navigation',
                message_type: 'LtiResourceLinkRequest',
                target_link_uri: 'https://grade.example.org/lti/launch',
                text: 'NodeGrade',
                windowTarget: '_blank',
                enabled: true,
              },
            ],
          },
        },
      ],
    });
  });
});
