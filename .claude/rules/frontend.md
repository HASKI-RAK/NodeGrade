---
paths:
  - "packages/frontend/**/*.{ts,tsx}"
---

# Frontend rules (React 19, Vite, MUI)

- Reach the server only through `@/api/http` (the `api` object, `apiRequest`, `ApiError`)
  and `@/utils/socket`. No component calls `fetch` directly.
- Never hardcode the API base or read it from `import.meta.env`: `getConfig()` in
  `@/utils/config` reads `public/config/env.<mode>.json` at runtime.
- Participant identity lives in `@/store/workspaceSession` (`ensureWorkspaceSession`, one
  bootstrap per page view) and `@/store/workspaceStore` (localStorage). `store/Zustand/Store.ts`
  is an unused scaffold — do not put session or editor state there.
- Import with the `@/` alias, not deep relative paths. Shared graph types come from
  `@haski/ta-lib`.
- UI is MUI 7 with the Emotion `css` prop (`jsxImportSource` is configured); use MUI
  components and `sx`/`css` rather than new CSS files.
- Routes are declared in `src/routes.tsx`. A route that needs a workflow takes it from the
  path; the editor must not invent one when the segment is missing.
- Editor state flows through the existing hooks — `useSocket`, `useServerEvents`,
  `useAutosave`, `useGraphHistory`, `useGraphOperations`, `useWorkspaceSession` — rather
  than new ad-hoc effects around the LiteGraph instance.
- Handle `ApiError` by its `body.code` (for example a version conflict carrying
  `currentVersion`), not by message text.
- Prettier here means no semicolons, single quotes, no trailing commas, 90 columns;
  imports are sorted by `eslint-plugin-simple-import-sort`. `lint:check` allows zero
  warnings.
