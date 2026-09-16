---
id: SPEC-0013
type: feature
title: Facilitator authentication and administrative access
status: implemented
parent: null
priority: P0
created: 2026-09-15
updated: 2026-09-16
depends_on: []
related:
  - SPEC-0002
  - SPEC-0003
  - SPEC-0009
  - SPEC-0014
---

# Facilitator authentication and administrative access

## Intent

### Problem

Administrative actions (template administration, workshop code management, provider
configuration, model policy) are restricted to a facilitator role, but the
authentication mechanism for that role was defined inside the template subsystem. It
is a cross-cutting foundation used by several features, not a template concern, and it
lacks session-security requirements (throttling, expiration, cookie flags, CSRF).

### Desired outcome

A small foundational authentication feature: env-configured admin username/password,
server-issued administrative session, and hardened session handling. All
administrative features depend on this instead of on the template subsystem.

## Scope

### In scope

- Facilitator login with admin username and password configured as server environment
  variables (supplyable via docker compose).
- Server-issued administrative session with expiration.
- Failed-login throttling.
- Session cookie security attributes (HttpOnly, Secure, SameSite).
- Logout.
- CSRF protection for administrative mutations.
- Credentials and secrets never logged.

### Out of scope

- General user accounts, registration, or password reset.
- Multiple roles or fine-grained permissions (single facilitator role).
- OAuth or external identity providers.

## Actors

- Facilitator (admin): authenticates with env-configured credentials to perform any
  administrative action.
- End user (participant, instructor, expert user): never authenticates; has no
  administrative access.

## User scenarios

### US-001 — Log in as facilitator

As a facilitator,
I want to log in with the deployment's admin credentials,
so that I can manage templates, workshops, providers, and model policy.

Priority: P1

Independent value: all administrative features share one authentication foundation.

### US-002 — Protected against credential guessing

As a facilitator,
I want failed login attempts to be throttled,
so that the admin interface cannot be brute-forced during a public workshop.

Priority: P1

Independent value: the admin surface is exposed on a network with 50 anonymous users.

## Functional requirements

### FR-001 — Env-configured credentials

WHEN a user presents the admin username and password configured on the server,
the system SHALL treat that user as a facilitator.

### FR-002 — Invalid credentials rejected

IF authentication is attempted with invalid credentials,
THEN the system SHALL reject it without granting facilitator privileges.

### FR-003 — Server-issued session

WHEN authentication succeeds,
the system SHALL issue a server-side administrative session that expires after a
configured lifetime.

### FR-004 — Failed-login throttling

IF repeated failed login attempts occur,
THEN the system SHALL throttle further login attempts for a defined period.

### FR-005 — Secure session cookie

WHEN an administrative session is issued,
the session cookie SHALL be set with HttpOnly, Secure, and SameSite attributes.

### FR-006 — Logout

WHEN a facilitator logs out,
the system SHALL invalidate the administrative session.

### FR-007 — CSRF protection

WHEN an administrative mutation is performed,
the system SHALL require a valid CSRF token.

### FR-008 — No credential leakage

The system SHALL NOT write admin credentials, session tokens, or provider secrets to
logs or error messages.

## Non-functional requirements

### NFR-001 — Login latency

Successful login SHALL complete within 1 second under normal load.

Verification: automated test performing 20 sequential logins; all complete within
1 second.

## Acceptance criteria

### AC-001 — Valid credentials grant facilitator role

Traces to: FR-001, FR-003

```gherkin
Given the server has admin credentials configured via environment variables
When a user authenticates with those credentials
Then the user acts as facilitator and holds a server-issued session
```

### AC-002 — Wrong credentials rejected

Traces to: FR-002

```gherkin
Given the server has admin credentials configured
When a user authenticates with incorrect credentials
Then no facilitator privileges are granted
```

### AC-003 — Session expires

Traces to: FR-003

```gherkin
Given a facilitator session issued at time T
When the session lifetime elapses
Then administrative actions with that session are rejected
```

### AC-004 — Throttling after repeated failures

Traces to: FR-004

```gherkin
Given the failure threshold has been exceeded
When another login attempt is made
Then the attempt is throttled for the defined period
```

### AC-005 — Logout invalidates session

Traces to: FR-006

```gherkin
Given an authenticated facilitator session
When the facilitator logs out
Then subsequent administrative actions with that session are rejected
```

### AC-006 — Mutation without CSRF token rejected

Traces to: FR-007

```gherkin
Given an authenticated facilitator session
When an administrative mutation is performed without a valid CSRF token
Then the mutation is rejected
```

## Edge cases

- Admin credentials not configured in the environment → administrative features are
  disabled with a clear deployment-level message; no login is possible.
- Session issued before a server restart → session invalidation behavior after
  restart is a deployment decision (in-memory vs persisted sessions); either is
  acceptable if expiration is enforced.

## Business rules

- There SHALL be exactly one facilitator role, established exclusively through the
  env-configured credentials.

## Constraints

- Admin username and password SHALL be supplied as server environment variables
  (docker compose supplyable); no user-account or registration system is introduced.
- The session cookie SHALL be HttpOnly, Secure, and SameSite.

## Dependencies

- None (foundational).

## Assumptions

- A single facilitator (or small trusted group sharing the admin credentials)
  manages the deployment.

## Open questions

- None currently.

## Success criteria

- All administrative features (templates, workshops, providers, model policy) share
  this authentication foundation, and the admin surface is safe to expose to a room
  of anonymous users.

## Change history

| Date | Change |
|---|---|
| 2026-09-15 | Extracted from SPEC-0003 (FR-016/FR-017) as a foundational feature; added session security requirements (throttling, expiration, cookie flags, CSRF, logout) |
