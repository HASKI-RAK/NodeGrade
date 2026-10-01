import {
  DEFAULT_MAX_LOGINS,
  DEFAULT_WINDOW_MS,
  LtiLoginThrottle,
} from './lti-login-throttle.js';

describe('LtiLoginThrottle', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('allows sixty logins a minute per address by default (SPEC-0023/FR-002)', () => {
    delete process.env.LTI_LOGIN_WINDOW_MS;
    delete process.env.LTI_LOGIN_MAX;
    const throttle = new LtiLoginThrottle();

    for (let i = 0; i < DEFAULT_MAX_LOGINS; i++) throttle.record('ip', i);

    expect(throttle.retryAfterMs('ip', DEFAULT_MAX_LOGINS)).toBe(DEFAULT_WINDOW_MS - DEFAULT_MAX_LOGINS);
    expect(throttle.retryAfterMs('other', DEFAULT_MAX_LOGINS)).toBe(0);
  });

  it('reads its limit and window from the environment', () => {
    process.env.LTI_LOGIN_WINDOW_MS = '1000';
    process.env.LTI_LOGIN_MAX = '2';
    const throttle = new LtiLoginThrottle();

    throttle.record('ip', 100);
    expect(throttle.retryAfterMs('ip', 200)).toBe(0);
    throttle.record('ip', 200);

    expect(throttle.retryAfterMs('ip', 300)).toBe(800);
    expect(throttle.retryAfterMs('ip', 1101)).toBe(0);
  });
});
