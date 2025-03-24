type Platform = {
  default: boolean
  clientId: string
  toolUrl: string
  frontendLoginUrl: string
  authLoginUrl: string
  authTokenUrl: string
  targetLinkUri: string
  keySetUrl: string
  platformName: string
  keySet: object
  privateKeyFile: string
  publicKeyFile: string
  haskiLtiActivity: string
  deploymentIds: string[]
}
export default Platform
