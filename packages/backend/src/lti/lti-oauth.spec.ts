import { createHmac } from 'node:crypto';
import type { Request } from 'express';
import { verifyLtiOAuth } from './lti-oauth.js';

const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

describe('verifyLtiOAuth', () => {
  it('accepts a valid HMAC-SHA1 launch and rejects modified fields', () => {
    const payload: Record<string, unknown> = {
      oauth_consumer_key: 'key',
      oauth_signature_method: 'HMAC-SHA1',
      oauth_nonce: 'nonce',
      oauth_timestamp: '123',
      context_id: 'course',
    };
    const normalized = Object.entries(payload)
      .map(([key, value]) => [encode(key), encode(String(value))] as const)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    const base = `POST&${encode('https://example.test/lti/basiclogin')}&${encode(normalized)}`;
    payload.oauth_signature = createHmac('sha1', 'secret&')
      .update(base)
      .digest('base64');
    const request = {
      protocol: 'https',
      originalUrl: '/lti/basiclogin',
      get: () => 'example.test',
    } as unknown as Request;

    expect(verifyLtiOAuth(request, payload, 'key', 'secret')).toBe(true);
    expect(
      verifyLtiOAuth(
        request,
        { ...payload, context_id: 'other' },
        'key',
        'secret',
      ),
    ).toBe(false);
  });
});
