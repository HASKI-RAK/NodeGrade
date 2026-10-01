import { Logger } from '@nestjs/common';
import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { LTI_CLAIM, LTI_ROLE, type Jwk } from '@haski/lti';
import type { JwksFetcher } from './jwks-fetcher.js';
import { LtiLaunchService } from './lti-launch.service.js';
import { LtiLoginStateStore } from './lti-login-state.store.js';
import { LtiPlatformRegistry } from './lti-platform.registry.js';
import type { LtiService, LaunchInput } from './lti.service.js';

const TOOL_URL = 'https://grade.example.org';

const moodle = {
  issuer: 'https://moodle.example.org',
  clientId: 'abc123',
  deploymentIds: ['1'],
  authorizationEndpoint: 'https://moodle.example.org/mod/lti/auth.php',
  tokenEndpoint: 'https://moodle.example.org/mod/lti/token.php',
  jwksUri: 'https://moodle.example.org/mod/lti/certs.php',
  name: 'Example Moodle',
};

const canvasA = {
  issuer: 'https://canvas.instructure.com',
  clientId: '10000000000001',
  deploymentIds: ['7:abc'],
  authorizationEndpoint: 'https://sso.canvaslms.com/api/lti/authorize_redirect',
  tokenEndpoint: 'https://sso.canvaslms.com/login/oauth2/token',
  jwksUri: 'https://sso.canvaslms.com/api/lti/security/jwks',
};
const canvasB = { ...canvasA, clientId: '10000000000002' };

const base64url = (value: string) => Buffer.from(value, 'utf8').toString('base64url');

/** Signs a JWT with node:crypto, so the test does not pull jsonwebtoken into the backend. */
const signJwt = (
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  key: KeyObject,
): string => {
  const body = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createSign('RSA-SHA256').update(body).sign(key, 'base64url');
  return `${body}.${signature}`;
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

describe('LtiLaunchService', () => {
  const savedInsecure = process.env.COOKIE_INSECURE;

  // Secure cookies unless a test says otherwise: that is every deployment.
  beforeEach(() => {
    delete process.env.COOKIE_INSECURE;
  });

  afterEach(() => {
    if (savedInsecure === undefined) delete process.env.COOKIE_INSECURE;
    else process.env.COOKIE_INSECURE = savedInsecure;
    jest.restoreAllMocks();
  });

  const platformKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const platformJwk: Jwk = {
    ...(platformKeys.publicKey.export({ format: 'jwk' }) as Jwk),
    kid: 'platform-key-1',
    alg: 'RS256',
    use: 'sig',
  };

  const build = (platforms = [moodle, canvasA, canvasB], keys: Jwk[] = [platformJwk]) => {
    const logins = new LtiLoginStateStore();
    const jwks = {
      keys: jest.fn().mockResolvedValue(keys),
    };
    const lti = {
      establishLaunch: jest.fn((input: LaunchInput) =>
        Promise.resolve({
          redirectUrl: `http://front/${input.isEditor ? 'editor' : 'student'}/wf-1?lti=1`,
          isEditor: input.isEditor,
          ltiKey: `${input.issuer}|${input.contextId}|${input.resourceLinkId}`,
          workflowId: 'wf-1',
          cookie: {
            user_id: input.userId,
            timestamp: 'now',
            tool_consumer_instance_guid: input.platformGuid,
            isEditor: input.isEditor,
            lis_person_name_full: input.name,
            tool_consumer_instance_name: input.platformName,
            lis_person_contact_email_primary: input.email,
          },
        }),
      ),
    };
    const service = new LtiLaunchService(
      new LtiPlatformRegistry(platforms),
      logins,
      jwks as unknown as JwksFetcher,
      lti as unknown as LtiService,
    );
    return { service, logins, jwks, lti };
  };

  const moodleLogin = {
    iss: moodle.issuer,
    login_hint: '42',
    target_link_uri: `${TOOL_URL}/lti/launch`,
    lti_message_hint: 'hint-1',
    client_id: moodle.clientId,
    lti_deployment_id: '1',
  };

  /** Starts a login and returns what the platform would need to answer it. */
  const startLogin = (service: LtiLaunchService, raw: Record<string, unknown> = moodleLogin) => {
    const { redirectUrl, state } = service.login(raw, TOOL_URL);
    const nonce = new URL(redirectUrl).searchParams.get('nonce') as string;
    return { state, nonce };
  };

  const idToken = (
    nonce: string,
    overrides: Record<string, unknown> = {},
    options: { key?: KeyObject; kid?: string; alg?: string } = {},
  ) =>
    signJwt(
      { alg: options.alg ?? 'RS256', typ: 'JWT', kid: options.kid ?? platformJwk.kid },
      {
        iss: moodle.issuer,
        sub: 'user-7',
        aud: moodle.clientId,
        exp: nowSeconds() + 300,
        iat: nowSeconds(),
        nonce,
        name: 'Ada Lovelace',
        email: 'ada@example.test',
        [LTI_CLAIM.messageType]: 'LtiResourceLinkRequest',
        [LTI_CLAIM.version]: '1.3.0',
        [LTI_CLAIM.deploymentId]: '1',
        [LTI_CLAIM.roles]: [LTI_ROLE.instructor],
        [LTI_CLAIM.context]: { id: 'course-1', title: 'Analysis I' },
        [LTI_CLAIM.resourceLink]: { id: 'link-1', title: 'Exercise 3' },
        [LTI_CLAIM.toolPlatform]: { guid: 'moodle-guid', name: 'Example University' },
        ...overrides,
      },
      options.key ?? platformKeys.privateKey,
    );

  describe('login', () => {
    it('answers with the exact authentication request (FR-002)', () => {
      const { service, logins } = build();
      jest.spyOn(logins, 'issue').mockReturnValue({
        state: 'state-1',
        nonce: 'nonce-1',
        issuer: moodle.issuer,
        clientId: moodle.clientId,
        createdAt: Date.now(),
      });

      const result = service.login(moodleLogin, TOOL_URL);

      expect(result.state).toBe('state-1');
      expect(result.redirectUrl).toBe(
        'https://moodle.example.org/mod/lti/auth.php?scope=openid&response_type=id_token&response_mode=form_post&prompt=none&client_id=abc123&redirect_uri=https%3A%2F%2Fgrade.example.org%2Flti%2Flaunch&login_hint=42&state=state-1&nonce=nonce-1&lti_message_hint=hint-1',
      );
    });

    it('resolves a lone registration of an issuer without a client id', () => {
      const { service } = build();

      const { redirectUrl } = service.login(
        { iss: moodle.issuer, login_hint: '42' },
        TOOL_URL,
      );

      expect(new URL(redirectUrl).searchParams.get('client_id')).toBe('abc123');
      expect(new URL(redirectUrl).searchParams.has('lti_message_hint')).toBe(false);
    });

    it('refuses an unknown issuer', () => {
      const { service } = build();

      expect(() =>
        service.login({ iss: 'https://other.example.org', login_hint: '42' }, TOOL_URL),
      ).toThrow(expect.objectContaining({ status: 400, response: { code: 'lti_platform_unknown', message: expect.any(String) } }));
    });

    it('refuses an unknown client id of a known issuer', () => {
      const { service } = build();

      expect(() =>
        service.login({ ...moodleLogin, client_id: 'someone-else' }, TOOL_URL),
      ).toThrow(expect.objectContaining({ response: { code: 'lti_platform_unknown', message: expect.any(String) } }));
    });

    it('needs the client id when an issuer carries several registrations', () => {
      const { service } = build();

      expect(() =>
        service.login({ iss: canvasA.issuer, login_hint: '42' }, TOOL_URL),
      ).toThrow(expect.objectContaining({ response: { code: 'lti_platform_ambiguous', message: expect.any(String) } }));
      expect(
        service.login({ iss: canvasA.issuer, login_hint: '42', client_id: canvasB.clientId }, TOOL_URL).redirectUrl,
      ).toContain(`client_id=${canvasB.clientId}`);
    });

    it('refuses a deployment the registration does not list', () => {
      const { service } = build();

      expect(() =>
        service.login({ ...moodleLogin, lti_deployment_id: '9' }, TOOL_URL),
      ).toThrow(expect.objectContaining({ response: { code: 'lti_deployment_unknown', message: expect.any(String) } }));
    });

    it('refuses a request without a login hint', () => {
      const { service } = build();

      expect(() => service.login({ iss: moodle.issuer }, TOOL_URL)).toThrow(
        expect.objectContaining({ response: { code: 'lti_login_invalid', message: expect.any(String) } }),
      );
    });
  });

  describe('launch', () => {
    it('verifies the id_token and opens the editor for an instructor (FR-003, FR-004)', async () => {
      const { service, lti } = build();
      const { state, nonce } = startLogin(service);

      const launch = await service.launch({
        idToken: idToken(nonce),
        state,
        stateCookie: state,
      });

      expect(launch.redirectUrl).toBe('http://front/editor/wf-1?lti=1');
      expect(lti.establishLaunch).toHaveBeenCalledWith({
        protocol: { version: '1.3', clientId: moodle.clientId, deploymentId: '1' },
        issuer: moodle.issuer,
        contextId: 'course-1',
        contextTitle: 'Analysis I',
        resourceLinkId: 'link-1',
        resourceLinkTitle: 'Exercise 3',
        isEditor: true,
        activityName: 'default',
        userId: 'user-7',
        name: 'Ada Lovelace',
        email: 'ada@example.test',
        platformGuid: 'moodle-guid',
        platformName: 'Example University',
      });
    });

    it('opens the student view for a learner and reads the activity custom parameter', async () => {
      const { service, lti } = build();
      const { state, nonce } = startLogin(service);

      const launch = await service.launch({
        idToken: idToken(nonce, {
          [LTI_CLAIM.roles]: [LTI_ROLE.learner],
          [LTI_CLAIM.custom]: { activityname: 'intro' },
        }),
        state,
        stateCookie: state,
      });

      expect(launch.redirectUrl).toBe('http://front/student/wf-1?lti=1');
      expect(lti.establishLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ isEditor: false, activityName: 'intro' }),
      );
    });

    it('falls back to the issuer and registration name when the platform claim is absent', async () => {
      const { service, lti } = build();
      const { state, nonce } = startLogin(service);

      await service.launch({
        idToken: idToken(nonce, { [LTI_CLAIM.toolPlatform]: undefined }),
        state,
        stateCookie: state,
      });

      expect(lti.establishLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ platformGuid: moodle.issuer, platformName: 'Example Moodle' }),
      );
    });

    const refused = async (
      service: LtiLaunchService,
      request: { idToken: unknown; state: unknown; stateCookie: string | undefined },
      code: string,
      status = 401,
    ) => {
      await expect(service.launch(request)).rejects.toMatchObject({
        status,
        response: { code },
      });
    };

    it('refuses a state it did not issue', async () => {
      const { service, lti } = build();
      const { nonce } = startLogin(service);

      await refused(service, { idToken: idToken(nonce), state: 'forged', stateCookie: undefined }, 'lti_state_unknown');
      expect(lti.establishLaunch).not.toHaveBeenCalled();
    });

    it('refuses a replayed launch: the nonce is used once', async () => {
      const { service } = build();
      const { state, nonce } = startLogin(service);
      const token = idToken(nonce);
      await service.launch({ idToken: token, state, stateCookie: state });

      await refused(service, { idToken: token, state, stateCookie: state }, 'lti_state_unknown');
    });

    it('refuses a nonce that answers another login', async () => {
      const { service } = build();
      const first = startLogin(service);
      const second = startLogin(service);

      await refused(
        service,
        { idToken: idToken(first.nonce), state: second.state, stateCookie: second.state },
        'lti_invalid_nonce',
      );
    });

    it('refuses a launch without its state cookie while cookies are secure, and burns the login', async () => {
      const { service, lti } = build();
      const { state, nonce } = startLogin(service);
      const token = idToken(nonce);

      await refused(service, { idToken: token, state, stateCookie: undefined }, 'lti_state_cookie_missing');
      expect(lti.establishLaunch).not.toHaveBeenCalled();
      // The record was consumed by the refused attempt: the launch cannot be retried.
      await refused(service, { idToken: token, state, stateCookie: state }, 'lti_state_unknown');
    });

    it('accepts a launch without the cookie on an insecure stack, with a warning', async () => {
      process.env.COOKIE_INSECURE = 'true';
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { service } = build();
      const { state, nonce } = startLogin(service);

      const launch = await service.launch({ idToken: idToken(nonce), state, stateCookie: undefined });

      expect(launch.workflowId).toBe('wf-1');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('COOKIE_INSECURE'));
    });

    it('refuses a state cookie that names another login', async () => {
      const { service } = build();
      const { state, nonce } = startLogin(service);

      await refused(service, { idToken: idToken(nonce), state, stateCookie: 'other' }, 'lti_state_mismatch');
    });

    it('refuses a token signed by someone else', async () => {
      const { service } = build();
      const { state, nonce } = startLogin(service);

      await refused(
        service,
        { idToken: idToken(nonce, {}, { key: otherKeys.privateKey }), state, stateCookie: state },
        'lti_invalid_signature',
      );
    });

    it('refuses the wrong issuer', async () => {
      const { service } = build();
      const { state, nonce } = startLogin(service);

      await refused(
        service,
        { idToken: idToken(nonce, { iss: 'https://evil.example.org' }), state, stateCookie: state },
        'lti_invalid_issuer',
      );
    });

    it('refuses the wrong audience, and several audiences without azp', async () => {
      const { service } = build();
      const first = startLogin(service);
      await refused(
        service,
        { idToken: idToken(first.nonce, { aud: 'someone-else' }), state: first.state, stateCookie: first.state },
        'lti_invalid_audience',
      );

      const second = startLogin(service);
      await refused(
        service,
        { idToken: idToken(second.nonce, { aud: [moodle.clientId, 'other'] }), state: second.state, stateCookie: second.state },
        'lti_invalid_audience',
      );
    });

    it('accepts several audiences when azp names this tool', async () => {
      const { service } = build();
      const { state, nonce } = startLogin(service);

      const launch = await service.launch({
        idToken: idToken(nonce, { aud: [moodle.clientId, 'other'], azp: moodle.clientId }),
        state,
        stateCookie: state,
      });

      expect(launch.workflowId).toBe('wf-1');
    });

    it('refuses an expired token', async () => {
      const { service } = build();
      const { state, nonce } = startLogin(service);

      await refused(
        service,
        { idToken: idToken(nonce, { exp: nowSeconds() - 600, iat: nowSeconds() - 900 }), state, stateCookie: state },
        'lti_token_expired',
      );
    });

    it('refreshes the key set once for an unknown kid, then refuses', async () => {
      const { service, jwks } = build();
      const { state, nonce } = startLogin(service);

      await refused(
        service,
        { idToken: idToken(nonce, {}, { kid: 'rotated-away' }), state, stateCookie: state },
        'lti_unknown_kid',
      );
      expect(jwks.keys).toHaveBeenCalledTimes(2);
      expect(jwks.keys).toHaveBeenLastCalledWith(moodle.jwksUri, { refresh: true });
    });

    it('accepts a rotated key once the refreshed key set holds it', async () => {
      const rotated: Jwk = { ...platformJwk, kid: 'platform-key-2' };
      const { service, jwks } = build();
      jwks.keys.mockResolvedValueOnce([platformJwk]).mockResolvedValueOnce([rotated]);
      const { state, nonce } = startLogin(service);

      const launch = await service.launch({
        idToken: idToken(nonce, {}, { kid: 'platform-key-2' }),
        state,
        stateCookie: state,
      });

      expect(launch.workflowId).toBe('wf-1');
    });

    it('refuses an unknown deployment id', async () => {
      const { service } = build();
      const { state, nonce } = startLogin(service);

      await refused(
        service,
        { idToken: idToken(nonce, { [LTI_CLAIM.deploymentId]: '9' }), state, stateCookie: state },
        'lti_unknown_deployment',
      );
    });

    it('refuses a message that is not a resource link launch', async () => {
      const { service } = build();
      const { state, nonce } = startLogin(service);

      await refused(
        service,
        { idToken: idToken(nonce, { [LTI_CLAIM.messageType]: 'LtiDeepLinkingRequest' }), state, stateCookie: state },
        'lti_unsupported_message_type',
      );
    });

    it('refuses a version other than 1.3.0 and an algorithm outside the RSA family', async () => {
      const { service } = build();
      const first = startLogin(service);
      await refused(
        service,
        { idToken: idToken(first.nonce, { [LTI_CLAIM.version]: '1.1.0' }), state: first.state, stateCookie: first.state },
        'lti_unsupported_version',
      );

      const second = startLogin(service);
      await refused(
        service,
        { idToken: idToken(second.nonce, {}, { alg: 'HS256' }), state: second.state, stateCookie: second.state },
        'lti_unsupported_algorithm',
      );
    });

    it('refuses a launch that names no resource link', async () => {
      const { service } = build();
      const { state, nonce } = startLogin(service);

      await refused(
        service,
        { idToken: idToken(nonce, { [LTI_CLAIM.resourceLink]: undefined }), state, stateCookie: state },
        'lti_launch_incomplete',
        400,
      );
    });

    it('refuses a form without id_token or state', async () => {
      const { service } = build();

      await refused(service, { idToken: undefined, state: 's', stateCookie: undefined }, 'lti_launch_invalid', 400);
    });

    it('answers 502 when the platform key set cannot be fetched', async () => {
      const { service, jwks } = build();
      jwks.keys.mockRejectedValue(new Error('ECONNREFUSED'));
      const { state, nonce } = startLogin(service);

      await refused(service, { idToken: idToken(nonce), state, stateCookie: state }, 'lti_platform_keys_unavailable', 502);
    });
  });
});
