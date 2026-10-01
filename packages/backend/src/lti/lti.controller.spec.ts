import { Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { LTI_COOKIE_NAME } from './lti-cookie.js';
import type { LtiLaunchService } from './lti-launch.service.js';
import type { LtiToolKeys } from './lti-tool-keys.js';
import { LTI_STATE_COOKIE_NAME, LtiController } from './lti.controller.js';
import type { EstablishedLaunch, LtiService } from './lti.service.js';

const launch: EstablishedLaunch = {
  redirectUrl: 'https://grade.example.org/editor/wf-1?lti=1',
  isEditor: true,
  ltiKey: 'https://moodle.example.org|course-1|link-1',
  workflowId: 'wf-1',
  cookie: {
    user_id: 'user-7',
    timestamp: '2026-10-01T10:00:00.000Z',
    tool_consumer_instance_guid: 'moodle-guid',
    isEditor: true,
    lis_person_name_full: 'Ada Lovelace',
    tool_consumer_instance_name: 'Example University',
    lis_person_contact_email_primary: 'ada@example.test',
    ltiKey: 'https://moodle.example.org|course-1|link-1',
    workflowId: 'wf-1',
  },
};

describe('LtiController', () => {
  const savedToolUrl = process.env.LTI_TOOL_URL;
  const savedKey = process.env.LTI_CONSUMER_KEY;
  const savedSecret = process.env.LTI_CONSUMER_SECRET;

  afterEach(() => {
    for (const [name, value] of [
      ['LTI_TOOL_URL', savedToolUrl],
      ['LTI_CONSUMER_KEY', savedKey],
      ['LTI_CONSUMER_SECRET', savedSecret],
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
    const controller = new LtiController(
      lti as unknown as LtiService,
      launches as unknown as LtiLaunchService,
      toolKeys as unknown as LtiToolKeys,
    );
    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      redirect: jest.fn(),
    } as unknown as Response;
    const request = (cookies: Record<string, string> = {}) =>
      ({
        protocol: 'https',
        get: (name: string) => (name === 'host' ? 'grade.example.org' : undefined),
        cookies,
      }) as unknown as Request;
    return { controller, lti, launches, toolKeys, response, request };
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
      LTI_STATE_COOKIE_NAME,
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

  it('finishes a launch with the launch cookie and the frontend redirect (FR-004)', async () => {
    const { controller, launches, response, request } = build();

    await controller.launch(
      { id_token: 'jwt', state: 'state-1', lti_storage_target: 'ignored' },
      request({ [LTI_STATE_COOKIE_NAME]: 'state-1' }),
      response,
    );

    expect(launches.launch).toHaveBeenCalledWith({
      idToken: 'jwt',
      state: 'state-1',
      stateCookie: 'state-1',
    });
    expect(response.clearCookie).toHaveBeenCalledWith(LTI_STATE_COOKIE_NAME, { path: '/lti' });
    expect(response.cookie).toHaveBeenCalledWith(
      LTI_COOKIE_NAME,
      JSON.stringify(launch.cookie),
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
    expect(response.redirect).toHaveBeenCalledWith(302, launch.redirectUrl);
  });

  it('keeps the 1.1 basic launch and says it is deprecated', async () => {
    const { controller, lti, response, request } = build();
    delete process.env.LTI_CONSUMER_KEY;
    delete process.env.LTI_CONSUMER_SECRET;
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const payload = { user_id: '7', roles: 'Instructor' } as never;

    await controller.handleBasicLogin(payload, request(), response);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('LTI 1.1 is deprecated'));
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
