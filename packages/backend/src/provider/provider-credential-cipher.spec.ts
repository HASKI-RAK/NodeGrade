import { ProviderCredentialCipher } from './provider-credential-cipher.js';

const key = (byte: number): string =>
  Buffer.alloc(32, byte).toString('base64url');

describe('ProviderCredentialCipher', () => {
  const previous = process.env.PROVIDER_ENCRYPTION_KEY;

  afterEach(() => {
    if (previous === undefined) delete process.env.PROVIDER_ENCRYPTION_KEY;
    else process.env.PROVIDER_ENCRYPTION_KEY = previous;
  });

  it('round-trips credentials with unique authenticated envelopes', () => {
    process.env.PROVIDER_ENCRYPTION_KEY = key(1);
    const cipher = new ProviderCredentialCipher();
    const first = cipher.encrypt('secret-value');
    const second = cipher.encrypt('secret-value');

    expect(first).toMatch(
      /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
    expect(second).not.toBe(first);
    expect(cipher.decrypt(first)).toBe('secret-value');
  });

  it('rejects tampering and the wrong key', () => {
    process.env.PROVIDER_ENCRYPTION_KEY = key(2);
    const cipher = new ProviderCredentialCipher();
    const envelope = cipher.encrypt('secret-value');
    const tampered = `${envelope.slice(0, -1)}${envelope.endsWith('A') ? 'B' : 'A'}`;
    expect(() => cipher.decrypt(tampered)).toThrow();

    process.env.PROVIDER_ENCRYPTION_KEY = key(3);
    expect(() => cipher.decrypt(envelope)).toThrow();
  });

  it('reports missing and invalid master keys', () => {
    delete process.env.PROVIDER_ENCRYPTION_KEY;
    expect(new ProviderCredentialCipher().isAvailable()).toBe(false);
    process.env.PROVIDER_ENCRYPTION_KEY =
      Buffer.alloc(31).toString('base64url');
    expect(new ProviderCredentialCipher().isAvailable()).toBe(false);
  });
});
