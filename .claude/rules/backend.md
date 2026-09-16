---
paths:
  - "packages/backend/**/*.ts"
---

# Backend rules (NestJS, ESM)

- The package is ESM. Every relative import ends in `.js`, including imports of `.ts`
  files: `import { WorkflowService } from './workflow.service.js'`.
- A feature is a directory under `src/` holding `<name>.module.ts`, a controller, a
  service, `dto/*.dto.ts`, and `guards/` or `decorators/` where needed. Register new
  modules in `src/app/app.module.ts`.
- Controllers validate, resolve the caller, and delegate. Domain logic and every Prisma
  call belong in services; no controller imports `PrismaService`.
- Participant routes: `@WorkspaceScoped()` on the controller or handler plus
  `@CurrentWorkspace()` for the workspace. Never read a workspace id from a param, query
  or body, and always scope queries by the resolved workspace.
- Facilitator routes: `@Facilitator()`. Those callers use the session cookie and
  `X-CSRF-Token`, not a bearer token.
- The global `ValidationPipe` uses `whitelist` and `forbidNonWhitelisted`, so any field a
  client may send must be declared on a `class-validator` DTO or the request is rejected.
- Throw Nest HTTP exceptions with an object payload `{ code, message, ...context }`.
  `HttpExceptionFilter` turns it into the `{ statusCode, code, message }` envelope the
  frontend branches on. Never log headers or request bodies.
- Workflow writes go through the ETag path: parse `If-Match` with `parseIfMatch`, update
  with the version predicate, return `versionToEtag`.
- Secrets are hashed or encrypted before storage (`workspace-token.ts`,
  `provider-credential-cipher.ts`) and never returned by an API.
- Nodes get model access only through the injected `ModelCompletionRuntime`
  (`ProviderRuntimeService`) and worker URLs only through `buildNodeExecutionEnv()`.
  Do not read provider environment variables inside execution code.
- Background work that must survive a fresh deployment belongs in an
  `OnApplicationBootstrap` service and must be idempotent — scripts nobody runs are not a
  migration path.
- Do not edit `src/generated/prisma`; regenerate with `yarn setup`.
- Schema changes: edit `prisma/schema.prisma`, add a migration under `prisma/migrations/`,
  and prefer additive columns over destructive rewrites while `LegacyGraph` still exists.
