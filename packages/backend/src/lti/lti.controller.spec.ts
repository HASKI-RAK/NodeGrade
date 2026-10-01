import { Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { LTI_COOKIE_NAME, ltiStateCookieName } from './lti-cookie.js';
import type { LtiLaunchService } from './lti-launch.service.js';
import type { LtiLoginThrottle } from './lti-login-throttle.js';
import type { LtiToolKeys } from './lti-tool-keys.js';
import { LtiController } from './lti.controller.js';
import type { EstablishedLaunch, LtiService } from './lti.service.js';

const LTI_KEY = 'lti13:https://moodle.example.org|abc123|1|course-1|link-1';

const launch: EstablishedLaunch = {
  redirectUrl: 'https://grade.example.org/editor/wf-1?lti=1',
  isEditor: true,
  ltiKey: LTI_KEY,
  workflowId: 'wf-1',
  cookie: {
    user_id: 'user-7',
    timestamp: '2026-10-01T10:00:00.000Z',
    tool_consumer_instance_guid: 'moodle-guid',
    isEditor: true,
    lis_person_name_full: 'Ada Lovelace',
    tool_consumer_instance_name: 'Example University',
    lis_person_contact_email_primary: 'ada@example.test',
    ltiKey: LTI_KEY,
    workflowId: 'wf-1',
  },
};

describe('LtiController', () => {
  const savedToolUrl = process.env.LTI_TOOL_URL;
  const savedKey = process.env.LTI_CONSUMER_KEY;
  const savedSecret = process.env.LTI_CONSUMER_SECRET;
  const savedUnsigned = process.env.LTI_11_ALLOW_UNSIGNED;

  afterEach(() => {
    for (const [name, value] of [
      ['LTI_TOOL_URL', savedToolUrl],
      ['LTI_CONSUMER_KEY', savedKey],
      ['LTI_CONSUMER_SECRET', savedSecret],
      ['LTI_11_ALLOW_UNSIGNED', savedUnsigned],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    jest.restoreAllMocks();
  });

  const build = () => {
    const lti = { handleBasicLogin: jest.fn().mockResolvedValue(launch) };
    const launches = {
      login: jest.fn().mockReturnValue({
        redirectUrl: 'https://moodle.example.org/mod/lti/auth.php?state=state-1',
        state: 'state-1',
      }),
      launch: jest.fn().mockResolvedValue(launch),
    };
    const toolKeys = { jwks: jest.fn().mockReturnValue({ keys: [{ kty: 'RSA', kid: 'k' }] }) };
    const loginThrottle = { retryAfterMs: jest.fn().mockReturnValue(0), record: jest.fn() };
    const controller = new LtiController(
      lti as unknown as LtiService,
      launches as unknown as LtiLaunchService,
      toolKeys as unknown as LtiToolKeys,
      loginThrottle as unknown as LtiLoginThrottle,
    );
    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      redirect: jest.fn(),
      setHeader: jest.fn(),
    } as unknown as Response;
    const request = (cookies: Record<string, string> = {}) =>
      ({
        protocol: 'https',
        ip: '203.0.113.7',
        get: (name: string) => (name === 'host' ? 'grade.example.org' : undefined),
        cookies,
      }) as unknown as Request;
    return { controller, lti, launches, toolKeys, loginThrottle, response, request };
  };

  it('publishes the registration URLs from the request origin (FR-006)', () => {
    const { controller, request } = build();
    delete process.env.LTI_TOOL_URL;

    expect(controller.config(request())).toMatchObject({
      oidc_initiation_url: 'https://grade.example.org/lti/login',
      target_link_uri: 'https://grade.example.org/lti/launch',
      public_jwk_url: 'https://grade.example.org/lti/jwks',
    });
  });

  it('serves the tool key set (FR-007)', () => {
    const { controller } = build();

    expect(controller.jwks()).toEqual({ keys: [{ kty: 'RSA', kid: 'k' }] });
  });

  it('answers a login with the state cookie and the platform redirect (FR-002)', () => {
    const { controller, launches, response, request } = build();
    const query = { iss: 'https://moodle.example.org', login_hint: '42' };

    controller.loginByQuery(query, request(), response);

    expect(launches.login).toHaveBeenCalledWith(query, 'https://grade.example.org');
    expect(response.cookie).toHaveBeenCalledWith(
      'lti_nodegrade_state_state-1',
      'state-1',
      expect.objectContaining({ httpOnly: true, path: '/lti' }),
    );
    expect(response.redirect).toHaveBeenCalledWith(
      302,
      'https://moodle.example.org/mod/lti/auth.php?state=state-1',
    );
  });

  it('accepts the login as a form post as well', () => {
    const { controller, launches, response, request } = build();

    controller.loginByForm({ iss: 'https://moodle.example.org', login_hint: '42' }, request(), response);

    expect(launches.login).toHaveBeenCalledTimes(1);
  });

  it('records each login per address and refuses the address over the limit with 429 and Retry-After', () => {
    const { controller, launches, loginThrottle, response, request } = build();
    const login = { iss: 'https://moodle.example.org', login_hint: '42' };

    controller.loginByQuery(login, request(), response);
    expect(loginThrottle.record).toHaveBeenCalledWith('203.0.113.7');

    loginThrottle.retryAfterMs.mockReturnValue(30_500);
    expect(() => controller.loginByQuery(login, request(), response)).toThrow(
      expect.objectContaining({ status: 429, response: { code: 'too_many_requests', message: expect.stringContaining('31 seconds') } }),
    );
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '31');
    expect(launches.login).toHaveBeenCalledTimes(1);
    expect(loginThrottle.record).toHaveBeenCalledTimes(1);
  });

  it('names the state cookie per login, so parallel logins keep their own state', () => {
    const { controller, launches, response, request } = build();
    launches.login.mockReturnValueOnce({ redirectUrl: 'https://moodle.example.org/auth', state: 'state-2' });
    const login = { iss: 'https://moodle.example.org', login_hint: '42' };

    controller.loginByQuery(login, request(), response);
    controller.loginByQuery(login, request(), response);

    expect(response.cookie).toHaveBeenCalledWith(ltiStateCookieName('state-2'), 'state-2', expect.anything());
    expect(response.cookie).toHaveBeenCalledWith(ltiStateCookieName('state-1'), 'state-1', expect.anything());
  });

  it('finishes a launch with the launch cookie and the frontend redirect (FR-004)', async () => {
    const { controller, launches, response, request } = build();

    await controller.launch(
      { id_token: 'jwt', state: 'state-1', lti_storage_target: 'ignored' },
      request({ [ltiStateCookieName('state-1')]: 'state-1', [ltiStateCookieName('state-9')]: 'state-9' }),
      response,
    );

    expect(launches.launch).toHaveBeenCalledWith({
      idToken: 'jwt',
      state: 'state-1',
      stateCookie: 'state-1',
    });
    expect(response.clearCookie).toHaveBeenCalledWith(
      ltiStateCookieName('state-1'),
      expect.objectContaining({ path: '/lti', httpOnly: true, sameSite: 'none', secure: true }),
    );
    expect(response.clearCookie).not.toHaveBeenCalledWith(ltiStateCookieName('state-9'), expect.anything());
    expect(response.cookie).toHaveBeenCalledWith(
      LTI_COOKIE_NAME,
      JSON.stringify(launch.cookie),
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
    expect(response.redirect).toHaveBeenCalledWith(302, launch.redirectUrl);
  });

  it('hands an absent state cookie to the launch service as undefined', async () => {
    const { controller, launches, response, request } = build();

    await controller.launch({ id_token: 'jwt', state: 'state-1' }, request({}), response);

    expect(launches.launch).toHaveBeenCalledWith(expect.objectContaining({ stateCookie: undefined }));
  });

  it('refuses the 1.1 basic launch while the consumer credentials are unset (FR-005)', async () => {
    const { controller, lti, response, request } = build();
    delete process.env.LTI_CONSUMER_KEY;
    delete process.env.LTI_CONSUMER_SECRET;
    delete process.env.LTI_11_ALLOW_UNSIGNED;
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await expect(
      controller.handleBasicLogin({ user_id: '7', roles: 'Instructor' } as never, request(), response),
    ).rejects.toMatchObject({ status: 503, response: { code: 'lti_11_not_configured' } });
    expect(lti.handleBasicLogin).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('accepts an unsigned 1.1 launch only with LTI_11_ALLOW_UNSIGNED, warning each time', async () => {
    const { controller, lti, response, request } = build();
    delete process.env.LTI_CONSUMER_KEY;
    delete process.env.LTI_CONSUMER_SECRET;
    process.env.LTI_11_ALLOW_UNSIGNED = 'true';
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const payload = { user_id: '7', roles: 'Instructor' } as never;

    await controller.handleBasicLogin(payload, request(), response);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('LTI 1.1 is deprecated'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('LTI_11_ALLOW_UNSIGNED'));
    expect(lti.handleBasicLogin).toHaveBeenCalledWith(payload);
    expect(response.cookie).toHaveBeenCalledWith(
      LTI_COOKIE_NAME,
      JSON.stringify(launch.cookie),
      expect.anything(),
    );
    expect(response.redirect).toHaveBeenCalledWith(302, launch.redirectUrl);
  });

  it('refuses a 1.1 launch whose OAuth signature does not verify', async () => {
    const { controller, lti, response, request } = build();
    process.env.LTI_CONSUMER_KEY = 'key';
    process.env.LTI_CONSUMER_SECRET = 'secret';
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await expect(
      controller.handleBasicLogin(
        { user_id: '7', roles: 'Instructor', oauth_consumer_key: 'other' } as never,
        { ...request(), originalUrl: '/lti/basiclogin' } as unknown as Request,
        response,
      ),
    ).rejects.toMatchObject({ status: 400, response: { code: 'lti_oauth_invalid' } });
    expect(lti.handleBasicLogin).not.toHaveBeenCalled();
  });
});
