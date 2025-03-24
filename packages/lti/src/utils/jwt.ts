import jwt from 'jsonwebtoken'

export function verifyJwt(token: string, publicKey: string) {
  try {
    const decoded = jwt.verify(token, publicKey)
    return decoded
  } catch (err) {
    throw new Error('Invalid JWT token')
  }
}
