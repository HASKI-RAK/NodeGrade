---
paths:
  - "packages/backend/**/*.spec.ts"
  - "packages/backend/test/**"
  - "packages/frontend/src/**/*.test.{ts,tsx}"
  - "e2e/**"
---

# Test rules

- Backend unit tests are `*.spec.ts` colocated with the code, run by jest + `@swc/jest`,
  and use hand-written service doubles instead of a database. Keep them database-free.
- Backend integration tests are `*.int-spec.ts` under `packages/backend/test/`, run by
  `yarn test:int` against the debug PostgreSQL on port 15432, and must skip cleanly when
  that service is absent (ADR-0006). Use them for constraints and atomic updates only.
- Frontend tests are `*.test.ts(x)` colocated, run by vitest in jsdom with
  `src/test/setup.ts`. Stub the network with `stubApi`/`jsonResponse` from
  `@/test/apiStub` — stub `fetch`, not `@/api/http`, so request shaping stays covered.
- Playwright specs in `e2e/` drive the deterministic debug stack (fake model worker, seeded
  demo graph, fixed workshop code). They must not depend on a real provider.
- Prefer the narrowest run while iterating:
  `yarn workspace backend test --testPathPattern <term>` or
  `yarn workspace @haski/ta-frontend test:run <file>`.
- If backend suites fail after a `packages/lib` change, rebuild the library before
  debugging the test.
