/**
 * How many reverse proxies sit between the client and this process, for Express's
 * `trust proxy` setting. Each one appends itself to `X-Forwarded-For`, and Express
 * takes the client address from that many hops back.
 *
 * Defaults to 1, the Compose stack where only the frontend's nginx forwards to the
 * backend. `docker-compose.prod.yml` sets 2 because Traefik stands in front of nginx.
 * Anything unparseable or negative falls back to the default rather than to "trust
 * everything", which would let a client pick its own address.
 */
export const DEFAULT_TRUST_PROXY_HOPS = 1;

export function trustProxyHops(
  raw: string | undefined = process.env.TRUST_PROXY,
): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_TRUST_PROXY_HOPS;
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0) return DEFAULT_TRUST_PROXY_HOPS;
  return hops;
}
