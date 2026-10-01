import { createPublicKey, KeyObject } from 'crypto'

/** A JSON Web Key as a platform's key set serves it (RFC 7517). */
export interface Jwk {
  kty: string
  kid?: string
  alg?: string
  use?: string
  n?: string
  e?: string
  [parameter: string]: unknown
}

export interface JwkSet {
  keys: Jwk[]
}

export function isJwkSet(value: unknown): value is JwkSet {
  if (typeof value !== 'object' || value === null) return false
  const keys = (value as { keys?: unknown }).keys
  return (
    Array.isArray(keys) &&
    keys.every(
      (key) => typeof key === 'object' && key !== null && typeof (key as Jwk).kty === 'string'
    )
  )
}

/**
 * Picks the key an id_token header names. A `kid` is required: a platform rotates keys
 * and serves several at once, and guessing among them would let a wrong key verify a
 * token by accident. A key that declares a `use` other than signing is skipped.
 */
export function selectJwk(keys: Jwk[], kid: string): Jwk | undefined {
  return keys.find((key) => key.kid === kid && (key.use === undefined || key.use === 'sig'))
}

/** Turns a JWK into a key object jsonwebtoken can verify with; RSA keys only. */
export function jwkToPublicKey(jwk: Jwk): KeyObject {
  if (jwk.kty !== 'RSA') {
    throw new Error(`Unsupported JWK key type "${jwk.kty}"; the tool verifies RSA keys`)
  }
  return createPublicKey({ key: jwk as unknown as import('crypto').JsonWebKey, format: 'jwk' })
}
