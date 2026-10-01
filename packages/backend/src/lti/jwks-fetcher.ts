import { Injectable } from '@nestjs/common';
import { isJwkSet, type Jwk } from '@haski/lti';

export const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;

/**
 * Fetches a platform's public key set, with a short cache.
 *
 * A platform rotates keys and publishes the new one before signing with it, so a
 * launch that names an unknown `kid` asks for a refresh once; otherwise every launch
 * from a course would hit the platform's key endpoint. Injectable so tests hand the
 * launch service a key set without a network.
 */
@Injectable()
export class JwksFetcher {
  private readonly cache = new Map<
    string,
    { keys: Jwk[]; fetchedAt: number }
  >();

  async keys(
    jwksUri: string,
    options: { refresh?: boolean } = {},
    now: number = Date.now(),
  ): Promise<Jwk[]> {
    const cached = this.cache.get(jwksUri);
    if (
      cached &&
      !options.refresh &&
      now - cached.fetchedAt < JWKS_CACHE_TTL_MS
    ) {
      return cached.keys;
    }

    const response = await fetch(jwksUri, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `The platform key set ${jwksUri} answered ${response.status}.`,
      );
    }
    const body: unknown = await response.json();
    if (!isJwkSet(body)) {
      throw new Error(`The platform key set ${jwksUri} is not a JWK set.`);
    }
    this.cache.set(jwksUri, { keys: body.keys, fetchedAt: now });
    return body.keys;
  }
}
