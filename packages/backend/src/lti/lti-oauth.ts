import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const encode = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

export function verifyLtiOAuth(
  request: Request,
  payload: Record<string, unknown>,
  consumerKey: string,
  consumerSecret: string,
): boolean {
  if (payload.oauth_consumer_key !== consumerKey) return false;
  if (payload.oauth_signature_method !== 'HMAC-SHA1') return false;
  if (typeof payload.oauth_signature !== 'string') return false;

  const pairs = Object.entries(payload)
    .filter(([key, value]) => key !== 'oauth_signature' && value !== undefined)
    .map(([key, value]) => [encode(key), encode(String(value))] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey
        ? leftValue.localeCompare(rightValue)
        : leftKey.localeCompare(rightKey),
    );
  const normalized = pairs.map(([key, value]) => `${key}=${value}`).join('&');
  const protocol = request.protocol;
  const host = request.get('host');
  const path = request.originalUrl.split('?')[0];
  const baseUrl = `${protocol}://${host}${path}`;
  const base = `POST&${encode(baseUrl)}&${encode(normalized)}`;
  const expected = createHmac('sha1', `${encode(consumerSecret)}&`)
    .update(base)
    .digest();
  const supplied = Buffer.from(payload.oauth_signature, 'base64');
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}
