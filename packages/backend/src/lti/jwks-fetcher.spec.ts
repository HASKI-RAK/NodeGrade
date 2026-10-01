import {
  JWKS_CACHE_TTL_MS,
  JWKS_REFRESH_MIN_INTERVAL_MS,
  JwksFetcher,
} from './jwks-fetcher.js';

const uri = 'https://moodle.example.org/mod/lti/certs.php';
const now = Date.parse('2026-10-01T10:00:00.000Z');

const keySet = (kid: string) => ({ keys: [{ kty: 'RSA', kid, n: 'n', e: 'AQAB' }] });

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('JwksFetcher', () => {
  afterEach(() => jest.restoreAllMocks());

  const build = () => {
    // A Response body reads once, so every fetch gets a Response of its own.
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(keySet('k1')));
    return { fetcher: new JwksFetcher(), fetchMock };
  };

  it('fetches a key set once and serves it from the cache within the TTL', async () => {
    const { fetcher, fetchMock } = build();

    const first = await fetcher.keys(uri, {}, now);
    const second = await fetcher.keys(uri, {}, now + JWKS_CACHE_TTL_MS - 1);

    expect(first).toEqual(keySet('k1').keys);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(uri, expect.objectContaining({ headers: { accept: 'application/json' } }));
  });

  it('fetches again once the TTL has passed', async () => {
    const { fetcher, fetchMock } = build();
    await fetcher.keys(uri, {}, now);
    fetchMock.mockImplementation(async () => jsonResponse(keySet('k2')));

    const refetched = await fetcher.keys(uri, {}, now + JWKS_CACHE_TTL_MS);

    expect(refetched[0].kid).toBe('k2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('honours a forced refresh once a minute per key set (SPEC-0023/FR-003)', async () => {
    const { fetcher, fetchMock } = build();
    await fetcher.keys(uri, {}, now);
    fetchMock.mockImplementation(async () => jsonResponse(keySet('k2')));

    const refreshed = await fetcher.keys(uri, { refresh: true }, now + 1_000);
    // A second unknown kid right after: the cached set answers, the platform is left alone.
    const throttled = await fetcher.keys(uri, { refresh: true }, now + 1_000 + JWKS_REFRESH_MIN_INTERVAL_MS - 1);

    expect(refreshed[0].kid).toBe('k2');
    expect(throttled).toBe(refreshed);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('forces a refresh again once the minute has passed', async () => {
    const { fetcher, fetchMock } = build();
    await fetcher.keys(uri, { refresh: true }, now);

    await fetcher.keys(uri, { refresh: true }, now + JWKS_REFRESH_MIN_INTERVAL_MS);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throttles forced refreshes per key set, not globally', async () => {
    const { fetcher, fetchMock } = build();
    await fetcher.keys(uri, { refresh: true }, now);

    await fetcher.keys('https://canvas.example.org/jwks', { refresh: true }, now + 1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses an endpoint that fails or answers something other than a JWK set', async () => {
    const { fetcher, fetchMock } = build();

    fetchMock.mockImplementation(async () => jsonResponse({ error: 'down' }, 503));
    await expect(fetcher.keys(uri, {}, now)).rejects.toThrow(/answered 503/);

    fetchMock.mockImplementation(async () => jsonResponse({ keys: [{ no: 'kty' }] }));
    await expect(fetcher.keys(uri, {}, now)).rejects.toThrow(/not a JWK set/);
  });
});
