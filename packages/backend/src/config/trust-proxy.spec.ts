import { DEFAULT_TRUST_PROXY_HOPS, trustProxyHops } from './trust-proxy.js';

describe('trustProxyHops', () => {
  it('defaults to one hop, the nginx in the frontend image', () => {
    expect(trustProxyHops(undefined)).toBe(DEFAULT_TRUST_PROXY_HOPS);
    expect(trustProxyHops('')).toBe(DEFAULT_TRUST_PROXY_HOPS);
    expect(trustProxyHops('   ')).toBe(DEFAULT_TRUST_PROXY_HOPS);
  });

  it('reads the configured number of proxies', () => {
    expect(trustProxyHops('2')).toBe(2);
    expect(trustProxyHops('0')).toBe(0);
  });

  it('never widens trust on a value it cannot read', () => {
    expect(trustProxyHops('true')).toBe(DEFAULT_TRUST_PROXY_HOPS);
    expect(trustProxyHops('-1')).toBe(DEFAULT_TRUST_PROXY_HOPS);
    expect(trustProxyHops('1.5')).toBe(DEFAULT_TRUST_PROXY_HOPS);
  });
});
