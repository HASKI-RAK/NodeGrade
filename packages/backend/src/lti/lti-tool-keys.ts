import { Injectable } from '@nestjs/common';
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import type { Jwk, JwkSet } from '@haski/lti';
import { LtiConfigurationError } from '../config/lti-platforms.js';

/**
 * The public half of LTI_TOOL_PRIVATE_KEY as a JWK, or null when no key is configured.
 *
 * A launch never needs this key: the platform signs the id_token and the tool only
 * verifies. The key pair matters for what comes next (SPEC-0023 roadmap): the
 * client-credentials grant behind grade passback and roster reads is a JWT the tool
 * signs, and Deep Linking responses are signed the same way. Serving the public key
 * now lets an admin register NodeGrade once with a keyset URL that stays valid.
 */
export function toolPublicJwk(pem: string | undefined): Jwk | null {
  if (pem === undefined || pem.trim().length === 0) return null;
  // A PEM pasted into an environment file often arrives with literal "\n" sequences.
  const normalized = pem.replace(/\\n/g, '\n').trim();
  let privateKey: ReturnType<typeof createPrivateKey>;
  try {
    privateKey = createPrivateKey(normalized);
  } catch {
    throw new LtiConfigurationError(
      'LTI_TOOL_PRIVATE_KEY is not a PEM-encoded private key.',
    );
  }
  if (privateKey.asymmetricKeyType !== 'rsa') {
    throw new LtiConfigurationError(
      `LTI_TOOL_PRIVATE_KEY must be an RSA key, got ${String(privateKey.asymmetricKeyType)}.`,
    );
  }
  const publicKey = createPublicKey(privateKey);
  const jwk = publicKey.export({ format: 'jwk' }) as Jwk;
  // A stable id derived from the key itself, so a restart serves the same kid.
  const kid = createHash('sha256')
    .update(publicKey.export({ type: 'spki', format: 'der' }))
    .digest('base64url');
  return { ...jwk, kid, alg: 'RS256', use: 'sig' };
}

@Injectable()
export class LtiToolKeys {
  private readonly publicJwk: Jwk | null;

  // Reads the environment itself, like the throttles: Nest cannot inject a string.
  constructor() {
    this.publicJwk = toolPublicJwk(process.env.LTI_TOOL_PRIVATE_KEY);
  }

  get configured(): boolean {
    return this.publicJwk !== null;
  }

  /** The tool's key set as `GET /lti/jwks` serves it; empty without a configured key. */
  jwks(): JwkSet {
    return { keys: this.publicJwk ? [this.publicJwk] : [] };
  }
}
