# @haski/lti

LTI for the NodeGrade tool, as pure TypeScript with no framework or database
dependency. The backend (`packages/backend/src/lti/`) wires it into HTTP.

- `src/lti/claims.ts`: LTI 1.3 claim URIs, message types, the role vocabulary and
  `isEditorRole`.
- `src/lti/platform.ts`: `LtiPlatformRegistration`, what the tool records per platform.
- `src/lti/oidc.ts`: reading a third-party initiated login and building the
  authentication request (`buildOidcAuthorizationUrl`).
- `src/lti/launch.ts`: `verifyIdToken` (signature, `iss`, `aud`/`azp`, `exp`, `iat`,
  `nonce`, message type, version, deployment) and `mapLaunchClaims`.
- `src/utils/jwks.ts`: key selection by `kid` and JWK to key object conversion.
- `src/lti/ags.ts`, `src/lti/nrps.ts`: the service endpoints a launch advertises, for the
  grade passback and roster work that comes next.
- `src/lti/toolRegistration.ts`, `src/utils/typeGuards.ts`: the LTI 1.1 basic launch
  payload and the Dynamic Registration types.

`docs/lti.md` at the repository root explains the protocol, the registration steps for
Moodle and Canvas, and the roadmap.
