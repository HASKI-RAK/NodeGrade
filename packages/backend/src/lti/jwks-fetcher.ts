import { Injectable } from '@nestjs/common';
import { isJwkSet, type Jwk } from '@haski/lti';

export const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;
/** A forced refresh is served from the cache while the last one is this recent. */
export const JWKS_REFRESH_MIN_INTERVAL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;

type CachedKeySet = {
  keys: Jwk[];
  fetchedAt: number;
  /** When a launch last forced a refresh of this set; undefined before the first one. */
  refreshedAt: number | undefined;
};

/**
 * Fetches a platform's public key set, with a short cache.
 *
 * A platform rotates keys and publishes the new one before signing with it, so a
 * launch that names an unknown `kid` asks for a refresh; otherwise every launch from a
 * course would hit the platform's key endpoint. A forced refresh is honoured at most
 * once a minute per key set (SPEC-0023/FR-003): a stream of self-signed tokens with
 * made-up key ids would otherwise turn the launch endpoint into a request generator
 * against the platform. Injectable so tests hand the launch service a key set without
 * a network.
 */
@Injectable()
export class JwksFetcher {
  private readonly cache = new Map<string, CachedKeySet>();

  async keys(
    jwksUri: string,
    options: { refresh?: boolean } = {},
    now: number = Date.now(),
  ): Promise<Jwk[]> {
    const refresh = options.refresh === true;
    const cached = this.cache.get(jwksUri);
    if (cached && this.servesFromCache(cached, refresh, now)) {
      return cached.keys;
    }

    const keys = await this.download(jwksUri);
    this.cache.set(jwksUri, {
      keys,
      fetchedAt: now,
      refreshedAt: refresh ? now : cached?.refreshedAt,
    });
    return keys;
  }

  private servesFromCache(
    cached: CachedKeySet,
    refresh: boolean,
    now: number,
  ): boolean {
    if (refresh) {
      return (
        cached.refreshedAt !== undefined &&
        now - cached.refreshedAt < JWKS_REFRESH_MIN_INTERVAL_MS
      );
    }
    return now - cached.fetchedAt < JWKS_CACHE_TTL_MS;
  }

  private async download(jwksUri: string): Promise<Jwk[]> {
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
    return body.keys;
  }
}
