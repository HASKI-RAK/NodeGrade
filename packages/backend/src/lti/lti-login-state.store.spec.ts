import {
  LOGIN_STATE_TTL_MS,
  LtiLoginStateStore,
} from './lti-login-state.store.js';

const login = { issuer: 'https://moodle.example.org', clientId: 'abc' };

describe('LtiLoginStateStore', () => {
  const now = Date.parse('2026-10-01T10:00:00.000Z');

  it('issues distinct, high-entropy state and nonce values', () => {
    const store = new LtiLoginStateStore();

    const first = store.issue(login, now);
    const second = store.issue(login, now);

    expect(first.state).not.toBe(second.state);
    expect(first.nonce).not.toBe(first.state);
    expect(first.state.length).toBeGreaterThanOrEqual(43);
    expect(first).toMatchObject({ ...login, createdAt: now });
  });

  it('hands a record out once (SPEC-0023/FR-003)', () => {
    const store = new LtiLoginStateStore();
    const issued = store.issue(login, now);

    expect(store.consume(issued.state, now + 1000)).toEqual(issued);
    expect(store.consume(issued.state, now + 2000)).toBeNull();
  });

  it('knows nothing about a state it did not issue', () => {
    const store = new LtiLoginStateStore();

    expect(store.consume('forged', now)).toBeNull();
  });

  it('refuses a login older than the TTL', () => {
    const store = new LtiLoginStateStore();
    const issued = store.issue(login, now);

    expect(store.consume(issued.state, now + LOGIN_STATE_TTL_MS)).toBeNull();
  });

  it('drops expired logins when a new one is issued', () => {
    const store = new LtiLoginStateStore();
    store.issue(login, now);
    store.issue(login, now);

    store.issue(login, now + LOGIN_STATE_TTL_MS + 1);

    expect(store.size).toBe(1);
  });
});
