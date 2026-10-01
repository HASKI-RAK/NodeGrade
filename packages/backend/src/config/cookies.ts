import type { CookieOptions } from 'express';

/**
 * Cookies are marked Secure unless the deployment explicitly opts out.
 *
 * The opt-out exists because the debug stack serves plain HTTP on localhost, where a
 * Secure cookie is silently discarded by the browser — which is why the LTI cookie has
 * never worked against `yarn debug:up`.
 */
export const cookiesInsecure = (): boolean =>
  process.env.COOKIE_INSECURE === 'true' || process.env.COOKIE_INSECURE === '1';

/**
 * SameSite=Lax is correct for the split frontend/backend ports: "site" is scheme plus
 * registrable domain, so localhost:5173 -> localhost:5000 is same-site and the cookie is
 * sent. Serving the API from a different registrable domain would require
 * SameSite=None together with Secure.
 */
export function sessionCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: !cookiesInsecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}

/**
 * A cookie that must arrive on a cross-site form post, which is how an LTI platform
 * delivers a launch: SameSite=None, which browsers accept only together with Secure.
 * On the plain-HTTP debug stack the cookie falls back to Lax, where it is absent on
 * the cross-site post; the LTI login state store is the source of truth for that case.
 */
export function crossSiteCookieOptions(
  maxAgeMs: number,
  path = '/',
): CookieOptions {
  const secure = !cookiesInsecure();
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path,
    maxAge: maxAgeMs,
  };
}
