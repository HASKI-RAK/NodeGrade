import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class ProviderEncryptionUnavailableError extends Error {
  constructor(
    message = 'PROVIDER_ENCRYPTION_KEY must decode to exactly 32 bytes.',
  ) {
    super(message);
    this.name = 'ProviderEncryptionUnavailableError';
  }
}

@Injectable()
export class ProviderCredentialCipher {
  private key(): Buffer {
    const encoded = process.env.PROVIDER_ENCRYPTION_KEY;
    if (!encoded || !/^[A-Za-z0-9_-]+={0,2}$/.test(encoded))
      throw new ProviderEncryptionUnavailableError();
    const key = Buffer.from(encoded, 'base64url');
    if (key.length !== 32) throw new ProviderEncryptionUnavailableError();
    return key;
  }

  isAvailable(): boolean {
    try {
      this.key();
      return true;
    } catch {
      return false;
    }
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(envelope: string): string {
    const [version, ivValue, tagValue, ciphertextValue, extra] =
      envelope.split('.');
    if (
      version !== 'v1' ||
      !ivValue ||
      !tagValue ||
      !ciphertextValue ||
      extra !== undefined
    )
      throw new Error('Invalid provider credential envelope.');
    const iv = Buffer.from(ivValue, 'base64url');
    const tag = Buffer.from(tagValue, 'base64url');
    if (iv.length !== 12 || tag.length !== 16)
      throw new Error('Invalid provider credential envelope.');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
