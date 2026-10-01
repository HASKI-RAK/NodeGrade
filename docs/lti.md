# LTI in NodeGrade

How a learning management system launches NodeGrade, what the repository implements, how
to register it in Moodle and Canvas, and what comes next. The specification is
`specs/SPEC-0023-lti-13-launch/spec.md`; the code is `packages/lti/` (protocol, pure
TypeScript) and `packages/backend/src/lti/` (HTTP, Nest).

## What LTI is

Learning Tools Interoperability (LTI) is the 1EdTech (formerly IMS Global) standard by
which a learning platform (Moodle, Canvas, Brightspace, Blackboard) embeds an external
tool into a course and tells the tool who is launching, from which course and which
placement, and in which role. The platform is the identity provider; the tool trusts the
launch message and never asks the person to sign in again. Everything else — reading the
roster, writing grades, letting an instructor pick content — is a service the tool calls
back on the platform with its own credentials.

## LTI 1.1 versus LTI 1.3

| | LTI 1.1 (2012) | LTI 1.3 and LTI Advantage (2019) |
|---|---|---|
| Launch | Browser form post of ~40 fields to the tool's launch URL | OpenID Connect third-party initiated login, then a form post of a signed JWT (`id_token`) |
| Trust | OAuth 1.0a HMAC-SHA1 over a shared consumer key and secret | Asymmetric keys: the platform signs with its private key, the tool verifies with the platform's published JWKS; the tool has a key pair of its own for services |
| Identity | `user_id`, `context_id`, `resource_link_id`, `roles` as short names or URNs | `sub`, and claims named by URI (`https://purl.imsglobal.org/spec/lti/claim/...`) with a role vocabulary of URIs |
| Services | Basic Outcomes (one grade) | Assignment and Grade Services, Names and Role Provisioning, Deep Linking, Dynamic Registration |
| Status | Certification and OAuth 1.0a ended 30 June 2021; all legacy support ended 30 June 2022 | Current |

The security difference is the point: a 1.1 secret is one string shared by every launch,
and whoever holds it can forge any launch for that platform. In 1.3 the platform's private
key never leaves the platform, every launch is bound to a login the tool itself started
(`state`, `nonce`), and a token is addressed to one tool (`aud`), one deployment and one
point in time (`exp`).

## What NodeGrade implemented before this change

- `POST /lti/basiclogin` (`packages/backend/src/lti/lti.controller.ts`): the 1.1 basic
  launch, validated field by field by `pipes/lti-validation.pipe.ts` and verified with
  OAuth 1.0a HMAC-SHA1 by `lti-oauth.ts` against `LTI_CONSUMER_KEY` and
  `LTI_CONSUMER_SECRET`.
- The launch cookie `lti_nodegrade_cookie` (`lti-cookie.ts`, `utils/LtiCookie.ts`): an
  HTTP-only JSON cookie with the person, the platform, `isEditor`, the `ltiKey` and the
  workflow to open. `WorkspaceGuard` and the Socket.IO adapter accept it in place of a
  bearer token; a learner's cookie puts the request on the published projection.
- The `ltiKey` mapping (SPEC-0004/FR-008): an `LTI` workspace per
  `issuer|context_id|resource_link_id`, with the OAuth consumer key as issuer, seeded from
  the legacy graph that the `custom_activityname` parameter names.
- `packages/lti`: a 1.3 skeleton. The Dynamic Registration types
  (`toolRegistration.ts`) and their type guards were never called; `lti.ts` held a
  `handleLaunchRequest` that *signed* a JWT, which is the platform's job, not the tool's;
  `nrps.ts` held `console.log` stubs.

## What this change adds

### The library (`packages/lti`)

- `claims.ts`: the claim URIs, message types, version, the role vocabulary and
  `isEditorRole` (context `Instructor` and its sub-roles, `Administrator` of the context,
  the institution or the system; short names and 1.1 URNs for platforms that send them).
- `platform.ts`: `LtiPlatformRegistration` — what the tool records per platform.
- `oidc.ts`: `readOidcLoginRequest` and `buildOidcAuthorizationUrl`.
- `launch.ts`: `verifyIdToken` and `mapLaunchClaims`. Verification uses `jsonwebtoken`
  for the signature and `node:crypto`'s `createPublicKey({ format: 'jwk' })` for the
  platform's JWK; no dependency was added.
- `jwks.ts`: key selection by `kid` (required; a key with `use` other than `sig` is
  skipped).
- `ags.ts`, `nrps.ts`: typed readers of the service endpoints a launch advertises, for
  the roadmap below.

### The backend (`packages/backend/src/lti`, `LtiModule`)

| Route | Method | Purpose |
|---|---|---|
| `/lti/config` | GET | Tool configuration JSON for registration: login, launch and JWKS URLs, title, version, message type |
| `/lti/login` | GET, POST | OIDC third-party initiated login; redirects to the platform's authorization endpoint |
| `/lti/launch` | POST | The platform posts `id_token` and `state`; verified, then the session is established |
| `/lti/jwks` | GET | The tool's public key set from `LTI_TOOL_PRIVATE_KEY`; `{ "keys": [] }` when unset |
| `/lti/basiclogin` | POST | The LTI 1.1 basic launch; logs a deprecation line per launch |

All five are excluded from the global `api` prefix in `main.ts`, because platforms call
the URLs an administrator registered. The frontend's nginx proxies `/lti/` to the backend
in the Compose and production stacks, so the public URLs are `FRONTEND_URL` + `/lti/...`.
The Vite dev server of the debug stack proxies `/api` only, so there the tool URLs are the
backend's own (`http://localhost:15000/lti/...`, which `docker-compose.debug.yml` sets as
`LTI_TOOL_URL`).

The launch, step by step:

```mermaid
sequenceDiagram
    participant LMS as Platform (Moodle, Canvas)
    participant B as Browser
    participant T as NodeGrade /lti
    participant F as Frontend

    LMS->>B: resource link clicked
    B->>T: GET or POST /lti/login (iss, login_hint, client_id?, lti_deployment_id?, lti_message_hint?)
    T->>T: find registration, issue state + nonce (10 min, single use), set state cookie
    T-->>B: 302 authorization endpoint?scope=openid&response_type=id_token&response_mode=form_post&prompt=none&client_id&redirect_uri&login_hint&state&nonce&lti_message_hint
    B->>LMS: authentication request
    LMS->>LMS: user already signed in; sign id_token with platform private key
    LMS-->>B: auto-submitting form
    B->>T: POST /lti/launch (id_token, state)
    T->>T: consume state, fetch platform JWKS (cached), verify signature, iss, aud/azp, exp, iat, nonce, message type, version, deployment
    T->>T: workspace by issuer|context|resource link, first workflow, launch cookie
    T-->>B: 302 FRONTEND_URL/editor/:id?lti=1 or /student/:id?lti=1
    B->>F: editor or student view with lti_nodegrade_cookie
```

Where the pieces live:

- `lti-platform.registry.ts`: the registrations from `LTI_PLATFORMS`
  (`config/lti-platforms.ts` parses and validates them at startup).
- `lti-login-state.store.ts`: the pending logins, in memory, ten minutes, consumed once.
  The launch is a cross-site form post, which a `SameSite=Lax` cookie does not accompany
  and which some browsers strip of third-party cookies inside an LMS iframe, so the
  server-side record is the source of truth; the state cookie (`lti_nodegrade_state`,
  `SameSite=None; Secure` when cookies are secure) is checked when the browser sends it.
- `jwks-fetcher.ts`: the platform key set with a ten-minute cache and one forced refresh
  when a token names an unknown `kid` (key rotation).
- `lti-launch.service.ts`: the login and the launch, refusing with `{ code, message }`
  payloads such as `lti_platform_unknown`, `lti_state_unknown`, `lti_invalid_signature`,
  `lti_invalid_audience`, `lti_token_expired`, `lti_unknown_kid`, `lti_invalid_nonce`,
  `lti_unknown_deployment`, `lti_unsupported_message_type`; nothing it logs contains a
  token, a cookie or a body.
- `lti.service.ts`: `establishLaunch`, shared by both launch kinds; `handleBasicLogin`
  maps the 1.1 payload onto it; `ltiWorkspaceKey` derives the workspace key.
- `lti-tool-keys.ts`, `lti-tool-config.ts`: the tool key set and the configuration JSON.

What a 1.3 launch maps to: `sub` becomes `user_id`; context `Instructor` (and sub-roles)
or `Administrator` roles open the editor, everyone else the student view; `name` (or
given and family name) and `email` fill the cookie; the `activityname` custom parameter
names the legacy graph a new course workspace starts from, as `custom_activityname` did
in 1.1.

### Workspace keys

Each launch kind has its own key namespace (SPEC-0004/FR-008, `ltiWorkspaceKey` in
`lti.service.ts`):

| Launch | `ltiKey` |
|---|---|
| 1.1 | `<oauth_consumer_key>\|<context_id>\|<resource_link_id>`, unchanged, so existing course workspaces keep resolving |
| 1.3 | `lti13:<iss>\|<client_id>\|<deployment_id>\|<context.id>\|<resource_link.id>`; a resource link id is unique within one deployment and nowhere wider |

A 1.1 post can therefore never address a 1.3 workspace: its key has no `lti13:` prefix,
and a consumer key that spells the prefix out is refused. A platform migrated from 1.1 to
1.3 launches into a new `lti13:` workspace; it also sends the `lti1p1` claim with its old
consumer key, and honouring that claim (roadmap) is how a migrated course maps onto the
1.1 workspace it had before.

## Registering NodeGrade

Open `GET https://<your host>/lti/config` first; it lists the URLs below for your
deployment.

### Moodle (LTI Advantage)

Site administration → Plugins → Activity modules → External tool → Manage tools →
*Configure a tool manually*:

| Moodle field | Value |
|---|---|
| Tool name | NodeGrade |
| Tool URL | `https://<host>/lti/launch` |
| LTI version | LTI 1.3 |
| Public key type | Keyset URL |
| Public keyset | `https://<host>/lti/jwks` |
| Initiate login URL | `https://<host>/lti/login` |
| Redirection URI(s) | `https://<host>/lti/launch` |
| Custom parameters | optional, e.g. `activityname=default` |
| Default launch container | New window or Embed, as you prefer |
| Privacy: share launcher's name and email | yes, so the editor shows who launched |

Save, then open *View configuration details* on the tool's card and copy into
`LTI_PLATFORMS`:

| Moodle shows | Registration field |
|---|---|
| Platform ID | `issuer` |
| Client ID | `clientId` |
| Deployment ID | `deploymentIds` (one entry) |
| Public keyset URL (`/mod/lti/certs.php`) | `jwksUri` |
| Access token URL (`/mod/lti/token.php`) | `tokenEndpoint` |
| Authentication request URL (`/mod/lti/auth.php`) | `authorizationEndpoint` |

### Canvas

Admin → Developer Keys → *+ Developer Key* → *+ LTI Key*, method *Manual Entry* (or
*Paste JSON* with the fields `/lti/config` returns):

| Canvas field | Value |
|---|---|
| Title | NodeGrade |
| Target Link URI | `https://<host>/lti/launch` |
| OpenID Connect Initiation Url | `https://<host>/lti/login` |
| JWK Method | Public JWK URL → `https://<host>/lti/jwks` |
| Redirect URIs | `https://<host>/lti/launch` |
| LTI Advantage Services | none needed today |
| Privacy Level | Public, so name and email are sent |

Turn the key *ON*, copy its Client ID, then Settings → Apps → *+ App* → Configuration
Type *By Client ID* in the account or course; the Deployment ID appears on the installed
app. The registration is:

| Value | Registration field |
|---|---|
| `https://canvas.instructure.com` (self-hosted: your Canvas URL) | `issuer` |
| the developer key's Client ID | `clientId` |
| the installed app's Deployment ID | `deploymentIds` |
| `https://sso.canvaslms.com/api/lti/authorize_redirect` | `authorizationEndpoint` |
| `https://sso.canvaslms.com/login/oauth2/token` | `tokenEndpoint` |
| `https://sso.canvaslms.com/api/lti/security/jwks` | `jwksUri` |

Beta and test instances use `sso.beta.canvaslms.com` and `sso.test.canvaslms.com`. All
Instructure-hosted Canvas accounts share the issuer, so each account's key is its own
registration and Canvas always sends `client_id` on the login.

## Environment variables

| Variable | Purpose |
|---|---|
| `LTI_PLATFORMS` | JSON array of registrations: `issuer`, `clientId`, `deploymentIds`, `authorizationEndpoint`, `tokenEndpoint`, `jwksUri`, optional `name`. Validated at startup; a bad entry stops the backend with a line naming the entry and the field. Unset means no 1.3 platform. |
| `LTI_TOOL_PRIVATE_KEY` | Optional PEM RSA private key (`openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048`; literal `\n` is accepted). `/lti/jwks` serves its public half with a stable `kid`. Needed by the services below, not by the launch. |
| `LTI_TOOL_URL` | Public base URL of the `/lti` routes when it differs from the request origin (set by the debug stack to the backend port). |
| `LTI_CONSUMER_KEY`, `LTI_CONSUMER_SECRET` | The 1.1 basic launch credentials. While either is unset, `POST /lti/basiclogin` answers 503 `lti_11_not_configured`. |
| `LTI_11_ALLOW_UNSIGNED` | `true` accepts unsigned 1.1 launches while the credentials are unset, for a local test platform without a secret. Whoever posts the form then picks the course, the role and the person, and every launch logs a warning. Never set it on a deployment. |
| `FRONTEND_URL` | Where both launches redirect (`/editor/:id?lti=1`, `/student/:id?lti=1`). |
| `COOKIE_INSECURE` | On the plain-HTTP debug stack cookies lose `Secure`, and the state cookie falls back to `SameSite=Lax`; the server-side login record carries the launch. |

`stack.env.example`, `docker-compose.yml`, `docker-compose.prod.yml` and
`docker-compose.debug.yml` pass them through like `FRONTEND_URL`.

## Trying it

The quickest platform is the 1EdTech reference implementation
(https://lti-ri.imsglobal.org/): create a platform there, register NodeGrade with the
three URLs from `/lti/config`, put the platform's issuer, client id, deployment id and
endpoints into `LTI_PLATFORMS`, and launch a resource link. Against the debug stack
(`yarn debug:up`) the tool URLs are `http://localhost:15000/lti/...` and
`COOKIE_INSECURE=true` is already set.

## Roadmap

Everything below rides on the launch and on the tool key pair of `/lti/jwks`.

1. **Grade passback (AGS).** A launch from a Moodle or Canvas assignment carries
   `https://purl.imsglobal.org/spec/lti-ags/claim/endpoint` with the line item and the
   granted scopes (`readAgsEndpointClaim`). After a learner's run, NodeGrade obtains a tool
   access token from the platform's `tokenEndpoint` with the OAuth 2 client-credentials
   grant and a JWT client assertion signed with `LTI_TOOL_PRIVATE_KEY`, then `POST`s a
   score (`application/vnd.ims.lis.v1.score+json`: `userId`, `scoreGiven`,
   `scoreMaximum`, `activityProgress`, `gradingProgress`, `timestamp`) to the line item.
   The run record of SPEC-0020 already holds the score and the launch name, so this is a
   service call added to `GraphHandlerService`'s record step.
2. **Roster (NRPS).** The `namesroleservice` claim (`readNamesRoleServiceClaim`) names the
   context memberships URL; a GET with the same kind of access token and
   `Accept: application/vnd.ims.lti-nrps.v2.membershipcontainer+json` returns user ids,
   roles, names and emails, which lets the Submissions inbox show learners by name.
3. **Deep Linking.** A platform that offers content selection sends
   `LtiDeepLinkingRequest` with `deep_linking_settings` (return URL, accepted types).
   NodeGrade would let the instructor choose a workflow template and post back an
   `LtiDeepLinkingResponse` JWT signed with the tool key, whose `content_items` name a
   resource link with the template as a custom parameter. The launch refuses the message
   type today.
4. **Dynamic Registration.** Moodle (*Add LTI Advantage* with the registration URL) and
   Canvas (*Dynamic Registration*) open the tool's registration URL with
   `openid_configuration` and `registration_token`; the tool fetches the platform's
   configuration, POSTs its client registration (`initiate_login_uri`, `redirect_uris`,
   `jwks_uri`, the `lti-tool-configuration` claim) and receives `client_id` and a
   deployment id, then posts `org.imsglobal.lti.close`. The frontend page `/lti/register`
   and the types in `toolRegistration.ts` are the start; registrations have to move from
   `LTI_PLATFORMS` into the database for the tool to store what it receives. The schema
   already carries `LtiPlatform` and `LtiClientRegistration` models from that skeleton
   (`packages/backend/prisma/schema.prisma`), unused so far; `LtiPlatformRegistry` is the
   place to read them from.
5. **Platform storage.** When a browser blocks the state cookie inside the LMS iframe, the
   LTI Platform Storage profile keeps `state` through `postMessage` to the platform; the
   server-side login record makes this optional for NodeGrade.
6. **1.1 to 1.3 migration claim.** A platform migrated from 1.1 sends
   `https://purl.imsglobal.org/spec/lti/claim/lti1p1` with the old `user_id` and
   `oauth_consumer_key` (plus `oauth_consumer_key_sign`, an HMAC over the launch that
   proves the platform knew the secret). Today such a launch keys a new `lti13:`
   workspace; honouring the claim is how a migrated course would map onto its 1.1
   workspace (`consumer key|context|link`) after the switch.

## Sources

Normative texts, which 1EdTech publishes at these addresses (the implementation was
cross-checked against the reference libraries below, because the specification hosts were
unreachable from the build environment):

- LTI Core 1.3: https://www.imsglobal.org/spec/lti/v1p3
- 1EdTech Security Framework 1.0 (OIDC login, id_token validation):
  https://www.imsglobal.org/spec/security/v1p0/
- LTI 1.1 to 1.3 migration guide: https://www.imsglobal.org/spec/lti/v1p3/migr/
- Dynamic Registration 1.0: https://www.imsglobal.org/spec/lti-dr/v1p0
- Assignment and Grade Services 2.0: https://www.imsglobal.org/spec/lti-ags/v2p0
- Names and Role Provisioning Services 2.0: https://www.imsglobal.org/spec/lti-nrps/v2p0
- Deep Linking 2.0: https://www.imsglobal.org/spec/lti-dl/v2p0
- Deprecation notice for OAuth 1.0a and the legacy LTI schedule:
  https://www.imsglobal.org/deprecation-notice-oauth-10a,
  https://www.1edtech.org/lti-security-announcement-and-deprecation-schedule
- Canvas: https://canvas.instructure.com/doc/api/file.lti_dev_key_config.html,
  https://canvas.instructure.com/doc/api/file.lti_launch_overview.html,
  https://canvas.instructure.com/doc/api/file.registration.html
- Moodle: https://docs.moodle.org/en/External_tool_settings and the field mapping in
  https://github.com/microsoftarchive/Learn-LTI/blob/main/docs/CONFIGURATION_GUIDE.md
- Reference implementations read for the parameter sets and the validation order:
  https://github.com/packbackbooks/lti-1-3-php-library (`LtiOidcLogin`, `LtiMessageLaunch`,
  `LtiConstants`), https://github.com/IMSGlobal/lti-1-3-php-library,
  https://github.com/dmitry-viskov/pylti1.3 (`oidc_login`, `message_launch`, `roles`),
  https://github.com/Cvmcosta/ltijs
- 1EdTech reference platform for testing: https://lti-ri.imsglobal.org/
