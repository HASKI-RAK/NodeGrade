import jwt from 'jsonwebtoken'

export function verifyJwt(token: string, publicKey: string) {
  try {
    // Specify allowed algorithms to prevent algorithm confusion attacks
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256', 'RS384', 'RS512']
    })
    return decoded
  } catch (err) {
    throw new Error('Invalid JWT token')
  }
}
