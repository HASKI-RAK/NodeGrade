---
id: SPEC-0023
type: feature
title: LTI 1.3 launch
status: implemented
parent: null
priority: P1
created: 2026-10-01
updated: 2026-10-01
depends_on:
  - SPEC-0004
related:
  - SPEC-0013
  - SPEC-0020
  - SPEC-0022
---

# LTI 1.3 launch

## Intent

### Problem

NodeGrade reaches a learning management system through one path: the LTI 1.1 basic
launch at `POST /lti/basiclogin`, a form post signed with OAuth 1.0a HMAC-SHA1 over a
shared secret. 1EdTech ended certification of LTI 1.1 and of OAuth 1.0a on 30 June 2021
and all support for the legacy versions on 30 June 2022; Moodle, Canvas and Brightspace
steer new tool registrations to LTI 1.3, and an institution that has retired 1.1 cannot
add NodeGrade at all. The `@haski/lti` package held a 1.3 skeleton — registration types
never used, a launch handler that signed a token the tool must only verify, and
`console.log` stubs for the services — but no launch.

### Desired outcome

An LMS administrator registers NodeGrade as an LTI 1.3 tool with the three URLs every
platform asks for, enters the platform's values into the deployment, and a resource link
in a course launches NodeGrade: the platform starts an OpenID Connect third-party initiated
login, the tool answers with an authentication request, the platform posts a signed
id_token, and the tool verifies it against the platform's published keys before it
establishes the same `LTI` workspace, launch cookie and redirect the 1.1 launch
establishes. The 1.1 launch keeps working for platforms that still send it and says in
the log that it is deprecated. Grade passback, roster reads, Deep Linking and Dynamic
Registration are named as the next steps on the same key pair.

## Scope

### In scope

- Platform registrations from configuration (`LTI_PLATFORMS`), validated at startup.
- OIDC third-party initiated login at `/lti/login` (GET and POST) with a server-side,
  single-use login record and a per-login cross-site state cookie that binds the launch
  to the browser that started it.
- The id_token launch at `POST /lti/launch`: signature, issuer, audience, expiry, nonce,
  message type, version and deployment checks; claim mapping to NodeGrade's launch input.
- One shared launch tail for 1.1 and 1.3: workspace by `ltiKey`, first workflow, cookie,
  redirect.
- The tool's public configuration (`/lti/config`) and key set (`/lti/jwks`).
- Library support in `@haski/lti` without a framework or database dependency.

### Out of scope

- Service calls that need a tool access token: Assignment and Grade Services, Names and
  Role Provisioning (deferred, FR-010 and FR-011).
- Deep Linking and Dynamic Registration (deferred, FR-009 and FR-012).
- Persisting platform registrations in the database or editing them in the admin UI.
- The LTI Platform Storage (postMessage) fallback for browsers that block the state
  cookie in an iframe; launches open in a new window, where the cookie is first-party
  (docs/lti.md).

## Actors

- LMS administrator: registers the tool in Moodle or Canvas and configures the deployment.
- Instructor: launches from a course and lands in the editor of the course workspace.
- Learner: launches from a course and lands in the published student view.
- Platform: the LMS acting as OpenID provider; it signs the id_token.

## User scenarios

### US-001 — Administrator registers NodeGrade in an LMS

As an LMS administrator,
I want to register NodeGrade with the login, launch and key set URLs the platform asks
for and copy the platform's values into the deployment,
so that instructors can add NodeGrade to a course without a shared secret.

Priority: P1

Independent value: NodeGrade is installable in a platform that no longer offers LTI 1.1.

### US-002 — Instructor and learner launch from a course

As an instructor or learner,
I want a resource link in my course to open NodeGrade in the role the course gives me,
so that the course workspace is the same one every launch of that link reaches.

Priority: P1

Independent value: the 1.3 launch lands exactly where the 1.1 launch landed.

### US-003 — A forged or replayed launch gets nowhere

As an operator,
I want a launch to be accepted only when the platform I registered signed it for this
tool and for a login this server started,
so that no one reaches a course workspace by posting a token of their own.

Priority: P1

Independent value: the launch is an authentication, and it behaves like one.

## Functional requirements

### FR-001 — Platform registrations from configuration

WHEN the backend starts,
the system SHALL read `LTI_PLATFORMS` as a JSON array of registrations with `issuer`,
`clientId`, `deploymentIds`, `authorizationEndpoint`, `tokenEndpoint` and `jwksUri`, SHALL
refuse to start on a value that is not such an array, naming the entry and the field
that is wrong, and SHALL treat an unset value as no platform.

### FR-002 — OIDC third-party initiated login

WHEN a platform sends a login initiation to `/lti/login` by GET or POST,
the system SHALL require `iss` and `login_hint`, SHALL resolve the registration by `iss`
and, when present, `client_id`, SHALL refuse an unknown issuer or client, an ambiguous
issuer without `client_id`, and an `lti_deployment_id` the registration does not list,
SHALL record a login with a fresh `state` and `nonce` for ten minutes, SHALL set the
state in a cross-site cookie named for that login (`lti_nodegrade_state_<state>`, path
`/lti`, the same ten minutes), and SHALL redirect to the platform's authorization endpoint
with `scope=openid`, `response_type=id_token`, `response_mode=form_post`, `prompt=none`,
`client_id`, `redirect_uri` (the launch URL), `login_hint`, `state`, `nonce` and, when
given, `lti_message_hint`.

### FR-003 — Launch verification

WHEN a platform posts `id_token` and `state` to `/lti/launch`,
the system SHALL consume the login record for `state` exactly once, SHALL require the
cookie named for `state` to be present and equal to it while cookies are secure (401
`lti_state_cookie_missing` or `lti_state_mismatch`, the message telling the person to
start the tool from the course again in its own window), SHALL accept the record alone
only when `COOKIE_INSECURE` is set, logging a warning, SHALL clear that cookie on the
launch, SHALL verify the token's signature with
the key its `kid` names in the platform's key set (RS256 family only, refreshing the key
set once for an unknown `kid`), and SHALL require `iss` to equal the registration's
issuer, `aud` to contain the client id with `azp` equal to it whenever several audiences
or an `azp` are present, `exp` not to have passed, `iat` not to lie in the future, `nonce`
to equal the recorded one, the message type `LtiResourceLinkRequest`, the version `1.3.0`
and a `deployment_id` the registration lists. Any failure SHALL be refused with a `{ code,
message }` payload and SHALL log no token, cookie or body.

### FR-004 — One session for both launch kinds

WHEN a 1.1 or a 1.3 launch is verified,
the system SHALL establish the `LTI` workspace keyed per SPEC-0004/FR-008: a 1.1 launch
by `consumer_key|context_id|resource_link_id`, a 1.3 launch by
`lti13:iss|client_id|deployment_id|context_id|resource_link_id`, SHALL refuse a 1.1
launch whose key would begin with the `lti13:` namespace, SHALL open the workspace's
oldest workflow or seed one from the legacy graph the `activityname` custom parameter
names, SHALL set the `lti_nodegrade_cookie` with
the person, platform, role and `ltiKey`, and SHALL redirect an instructor to
`/editor/:id?lti=1` and anyone else to `/student/:id?lti=1` on the frontend. For a 1.3
launch an editor is a context `Instructor` (including its sub-roles) or an `Administrator`
of the context, institution or system.

### FR-005 — The 1.1 basic launch stays, deprecated

WHEN a platform posts an LTI 1.1 basic launch to `/lti/basiclogin`,
the system SHALL verify it with OAuth 1.0a HMAC-SHA1 against `LTI_CONSUMER_KEY` and
`LTI_CONSUMER_SECRET`, SHALL refuse the launch with 503 `lti_11_not_configured` while
either is unset unless `LTI_11_ALLOW_UNSIGNED` is `true` (local testing; one warning per
unsigned launch), SHALL establish the session through FR-004, and SHALL log one line per
launch saying that LTI 1.1 is deprecated. A 1.1 editor is a context role
`urn:lti:role:ims/lis/Instructor` (or an `Instructor/...` sub-role) or
`urn:lti:role:ims/lis/Administrator`, an `urn:lti:instrole:` or `urn:lti:sysrole:`
`Administrator`, or the bare name `Instructor` or `Administrator`; an institution or
system `Instructor` stays a learner, as it does under FR-004.

### FR-006 — Tool configuration for registration

WHEN `GET /lti/config` is requested,
the system SHALL answer with the login, launch (also the redirect URI) and key set URLs
derived from `LTI_TOOL_URL` or the request origin, the title, the LTI version and the
message type, so an administrator can copy them into Moodle or Canvas.

### FR-007 — Tool key set

WHEN `GET /lti/jwks` is requested,
the system SHALL answer with the RSA public key derived from `LTI_TOOL_PRIVATE_KEY` as a
JWK with a stable `kid`, or `{ "keys": [] }` when no key is configured.

### FR-008 — Routes outside the API prefix

The system SHALL serve `/lti/config`, `/lti/login`, `/lti/launch`, `/lti/jwks` and
`/lti/basiclogin` without the global `api` prefix, because platforms call the URLs an
administrator registered.

Verification: `main.ts` lists each route in the prefix exclusions; the frontend's nginx
proxies `/lti/` whole, so the Compose and production stacks reach them on the public
origin.

### FR-009 — Deep Linking (deferred)

WHEN a platform sends an `LtiDeepLinkingRequest`,
the system SHALL let the instructor pick a workflow template and SHALL answer with a
signed `LtiDeepLinkingResponse` naming a resource link with that template as a custom
parameter.

Verification: deferred. The launch refuses the message type today
(`lti-launch.service.spec.ts`, "refuses a message that is not a resource link launch");
the response will need the tool key of FR-007.

### FR-010 — Grade passback through AGS (deferred)

WHEN a learner's run completes under a launch whose AGS endpoint claim grants the `score`
scope,
the system SHALL publish the run's score to the platform line item with a tool access
token obtained by the client-credentials grant signed with the tool key.

Verification: deferred. `@haski/lti` reads the endpoint claim (`readAgsEndpointClaim`,
`lti-claims.spec.ts`); the run record of SPEC-0020 holds the score to publish.

### FR-011 — Roster through NRPS (deferred)

WHEN an instructor opens the Submissions inbox under a launch whose NRPS claim is present,
the system SHALL resolve learner ids to names through the context memberships service.

Verification: deferred. `@haski/lti` reads the claim (`readNamesRoleServiceClaim`,
`lti-claims.spec.ts`).

### FR-012 — Dynamic Registration (deferred)

WHEN a platform opens `/lti/register` with `openid_configuration` and `registration_token`,
the system SHALL fetch the platform configuration, register the tool and store the
resulting registration, replacing the manual `LTI_PLATFORMS` entry.

Verification: deferred. The frontend page and the registration types in
`packages/lti/src/lti/toolRegistration.ts` exist; registrations have to leave the
environment for the database first.

## Non-functional requirements

### NFR-001 — Nothing secret in the logs

The launch path SHALL log at most the issuer, deployment, context, resource link and role
of a launch, never the id_token, the state, the cookies or the posted form.

Verification: code review of `lti-launch.service.ts` and `lti.controller.ts`; the
controller spec asserts the deprecation line and nothing else is logged for a 1.1 launch.

## Acceptance criteria

### AC-001 — A misconfigured platform list stops the backend

Traces to: FR-001

```gherkin
Given LTI_PLATFORMS is an array whose second entry has no clientId
When the backend starts
Then it fails with "LTI_PLATFORMS: platform 2 needs a non-empty "clientId"."
And an unset LTI_PLATFORMS starts the backend with no platform
```

Tests: `config/lti-platforms.spec.ts`, `lti/lti.module.spec.ts`.

### AC-002 — The login answers with the exact authentication request

Traces to: FR-002

```gherkin
Given a registered platform
When it posts iss, login_hint, lti_message_hint and client_id to /lti/login
Then the browser is redirected to the platform's authorization endpoint with scope=openid, response_type=id_token, response_mode=form_post, prompt=none, client_id, redirect_uri, login_hint, state, nonce and lti_message_hint
And a state cookie named for that login is set on path /lti, so a second login in another tab keeps its own
And an unknown issuer, an unknown client, an ambiguous issuer without client_id, or an unlisted deployment id is refused
```

Tests: `lti/lti-launch.service.spec.ts` ("login"), `lti/lti.controller.spec.ts`.

### AC-003 — A valid launch opens the editor or the student view

Traces to: FR-003, FR-004

```gherkin
Given a login this server started
When the platform posts an id_token signed with the key its kid names, for this client, this nonce and a listed deployment
Then the lti_nodegrade_cookie is set and an instructor is redirected to /editor/:id?lti=1, a learner to /student/:id?lti=1
And the workspace is keyed by the platform issuer, the context id and the resource link id
```

Tests: `lti/lti-launch.service.spec.ts` ("launch"), `lti/lti.service.spec.ts`,
`lti/lti-claims.spec.ts`.

### AC-004 — Forged, stale and replayed launches are refused

Traces to: FR-003

```gherkin
Given a login this server started
When the id_token has a wrong issuer, a wrong audience, several audiences without azp, an expired exp, an unknown kid, a wrong nonce, an unlisted deployment id, a wrong message type, a wrong version or an algorithm outside the RSA family
Then the launch is refused with a code naming the check
And posting the same id_token and state a second time is refused as an unknown state
And a state the server did not issue is refused
And a launch without its state cookie is refused with lti_state_cookie_missing while cookies are secure, and its login record is spent
And a launch whose state cookie names another login is refused with lti_state_mismatch
And with COOKIE_INSECURE set, a launch without the cookie passes on the login record alone and the log carries a warning
```

Tests: `lti/lti-launch.service.spec.ts` ("launch"), `lti/lti-login-state.store.spec.ts`.

### AC-005 — The 1.1 launch still works and says it is deprecated

Traces to: FR-005, FR-004

```gherkin
Given LTI_CONSUMER_KEY and LTI_CONSUMER_SECRET are set
When a platform posts a correctly signed basic launch
Then the same cookie and redirect as a 1.3 launch follow and the log carries one deprecation line
And a launch with a wrong signature is refused with lti_oauth_invalid
And with either credential unset the launch is refused with 503 lti_11_not_configured, unless LTI_11_ALLOW_UNSIGNED is true
And a 1.1 launch naming a 1.3 issuer as its consumer key resolves a 1.1 key, never the lti13: key of that platform
And roles urn:lti:role:ims/lis/Learner,urn:lti:instrole:ims/lis/Instructor open the student view
```

Tests: `lti/lti.controller.spec.ts`, `lti/lti-oauth.spec.ts`, `lti/lti.service.spec.ts`.

### AC-006 — Configuration and key set are published

Traces to: FR-006, FR-007

```gherkin
Given the backend is reached at https://grade.example.org
When /lti/config is requested
Then it names https://grade.example.org/lti/login, /lti/launch and /lti/jwks
And /lti/jwks answers the RSA public key of LTI_TOOL_PRIVATE_KEY, or an empty key set without one
```

Tests: `lti/lti-tool-keys.spec.ts`, `lti/lti.controller.spec.ts`.

## Edge cases

- The browser sends no state cookie (the launch runs in an LMS iframe, where the browser
  withholds third-party cookies) → refused with `lti_state_cookie_missing`; the person
  starts the tool again from the course, which opens it in its own window. Only a
  plain-HTTP stack with `COOKIE_INSECURE` accepts the login record alone.
- The platform rotated its signing key → the key set is fetched again once for the unknown
  `kid`; a key still unknown is refused.
- The platform launches without a context claim → the workspace key carries an empty
  context id; the resource link id is required.
- The platform's key set endpoint is down → the launch answers 502
  `lti_platform_keys_unavailable` and the person retries from the course.
- One issuer hosts several tenants (Canvas) → one registration per client id; the login
  must carry `client_id`.
- A platform migrated from 1.1 to 1.3 → its launches key a new `lti13:` workspace; the
  `lti1p1` claim it sends names the old consumer key, and honouring it is how a migrated
  course would map onto its 1.1 workspace (roadmap, docs/lti.md).

## Business rules

- The tool verifies launches; it never signs one.
- A login record is used once; its nonce dies with it.
- A launch belongs to the browser that started its login: the state cookie says so, and
  only an insecure local stack may do without it.
- A registration lives in the deployment configuration, not in a request.

## Constraints

- No new runtime dependency: `jsonwebtoken` verifies, `node:crypto` turns JWKs into keys.
- `@haski/lti` stays free of NestJS and Prisma.
- Platform-facing handlers read raw bodies: the whitelisting ValidationPipe would reject
  the extra fields platforms send.

## Dependencies

- SPEC-0004 (the LTI workspace type and its key).

## Assumptions

- Platforms sign with RS256; RS384 and RS512 are accepted for completeness.
- A deployment runs one backend process, or launches of one login reach the same process
  within ten minutes; the login record is in memory.

## Open questions

- None currently.

## Success criteria

- An administrator registers NodeGrade in Moodle 4 and Canvas with the values of
  `/lti/config` and a resource link launches an instructor into the editor and a learner
  into the student view of the same workspace.
- A 1.1 platform keeps launching unchanged.

## Change history

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-01 | Review fix: 1.1 role URNs are read by namespace, so an institution `Instructor` no longer opens the editor (FR-005, AC-005). |
| 2026-10-01 | Review fix: the state cookie is named per login and required while cookies are secure (`lti_state_cookie_missing`); only `COOKIE_INSECURE` stacks accept the login record alone (FR-002, FR-003, AC-002, AC-004). |
| 2026-10-01 | Review fixes: the 1.1 launch is refused without consumer credentials unless `LTI_11_ALLOW_UNSIGNED` is set (FR-005, AC-005); 1.3 workspace keys carry the `lti13:` namespace with client and deployment id, and a 1.1 key never does (FR-004, SPEC-0004/FR-008). |
| 2026-10-01 | Initial specification and implementation: `@haski/lti` claims, OIDC login, id_token verification and claim mapping; backend `LtiModule` with `/lti/config`, `/lti/login`, `/lti/launch`, `/lti/jwks`, the shared `LtiService.establishLaunch` and the deprecated `/lti/basiclogin`; `LTI_PLATFORMS`, `LTI_TOOL_PRIVATE_KEY`, `LTI_TOOL_URL`; tests under `packages/backend/src/lti/` and `config/lti-platforms.spec.ts`; Deep Linking, AGS, NRPS and Dynamic Registration deferred. |
