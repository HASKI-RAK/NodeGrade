import { generateKeyPairSync } from 'node:crypto';
import type { Request } from 'express';
import { LtiConfigurationError } from '../config/lti-platforms.js';
import { ltiToolConfiguration, toolBaseUrl } from './lti-tool-config.js';
import { LtiToolKeys, toolPublicJwk } from './lti-tool-keys.js';

const rsaPem = () =>
  generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString();

describe('toolPublicJwk', () => {
  it('is null without a configured key', () => {
    expect(toolPublicJwk(undefined)).toBeNull();
    expect(toolPublicJwk('')).toBeNull();
  });

  it('derives a signing JWK with a stable kid from the private key', () => {
    const pem = rsaPem();

    const first = toolPublicJwk(pem);
    const second = toolPublicJwk(pem);

    expect(first).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig' });
    expect(first?.n).toBeDefined();
    expect(first?.kid).toBe(second?.kid);
    // The private exponent never appears in the published key.
    expect(first).not.toHaveProperty('d');
  });

  it('accepts a PEM whose newlines arrived escaped', () => {
    const pem = rsaPem();

    expect(toolPublicJwk(pem.replace(/\n/g, '\\n'))?.kid).toBe(
      toolPublicJwk(pem)?.kid,
    );
  });

  it('refuses anything but an RSA private key, by name', () => {
    expect(() => toolPublicJwk('not a key')).toThrow(LtiConfigurationError);
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();
    expect(() => toolPublicJwk(ec)).toThrow(/must be an RSA key/);
  });
});

describe('LtiToolKeys', () => {
  const saved = process.env.LTI_TOOL_PRIVATE_KEY;

  afterEach(() => {
    if (saved === undefined) delete process.env.LTI_TOOL_PRIVATE_KEY;
    else process.env.LTI_TOOL_PRIVATE_KEY = saved;
  });

  it('serves an empty key set when no key is configured (FR-007)', () => {
    delete process.env.LTI_TOOL_PRIVATE_KEY;

    const keys = new LtiToolKeys();

    expect(keys.configured).toBe(false);
    expect(keys.jwks()).toEqual({ keys: [] });
  });

  it('serves the public key when one is configured', () => {
    process.env.LTI_TOOL_PRIVATE_KEY = rsaPem();

    const keys = new LtiToolKeys();

    expect(keys.configured).toBe(true);
    expect(keys.jwks().keys).toHaveLength(1);
  });
});

describe('tool configuration', () => {
  const request = {
    protocol: 'https',
    get: (name: string) => (name === 'host' ? 'grade.example.org' : undefined),
  } as unknown as Pick<Request, 'protocol' | 'get'>;

  it('derives the tool URL from the request origin', () => {
    expect(toolBaseUrl(request, undefined)).toBe('https://grade.example.org');
  });

  it('prefers a configured public URL, without a trailing slash', () => {
    expect(toolBaseUrl(request, 'https://public.example.org/ ')).toBe(
      'https://public.example.org',
    );
  });

  it('names the login, launch and key set URLs an admin registers (FR-006)', () => {
    const config = ltiToolConfiguration('https://grade.example.org');

    expect(config).toMatchObject({
      title: 'NodeGrade',
      lti_version: '1.3.0',
      oidc_initiation_url: 'https://grade.example.org/lti/login',
      target_link_uri: 'https://grade.example.org/lti/launch',
      redirect_uris: ['https://grade.example.org/lti/launch'],
      public_jwk_url: 'https://grade.example.org/lti/jwks',
      scopes: [],
    });
    expect(config.messages[0]).toEqual({
      type: 'LtiResourceLinkRequest',
      target_link_uri: 'https://grade.example.org/lti/launch',
    });
  });
});
