---
paths:
  - "packages/frontend/**/*.{ts,tsx}"
---

# Frontend rules (React 19, Vite, MUI)

- Reach the server only through `@/api/http` (the `api` object, `apiRequest`, `ApiError`)
  and `@/utils/socket`. No component calls `fetch` directly.
- Never hardcode the API base or read it from `import.meta.env`: `getConfig()` in
  `@/utils/config` reads `public/config/env.<mode>.json` at runtime.
- Participant identity lives in `@/store/workspaceStore` (localStorage): the browser's
  own workspace, one token per joined workshop, the workshop joined last, and the active
  session the editor uses. The browser workspace is bootstrapped only through
  `@/store/workspaceSession` (`ensureWorkspaceSession`, one shared promise per page view)
  and its hook `@/hooks/useWorkspaceSession`; a workshop workspace comes only from the
  join in `pages/WorkshopJoin.tsx`; LTI launches use the cookie instead. Activation is
  the page's job, never the bootstrap's: `ensureWorkspaceSession` only remembers the
  browser workspace (`workspaceStore.rememberBrowser`), `useWorkspaceSession` activates
  it on every mount while the page is still mounted (`workspaceStore.activate`), and a
  handler that opens the editor activates the session it used right before navigating;
  `workspaceStore.saveWorkshop` activates the workshop session as the join route runs.
  Never activate a session a page did not establish. `store/Zustand/Store.ts` is an
  unused scaffold — do not put session or editor state there.
- Pages outside the editor render under the `AppShell` layout route in `src/routes.tsx`;
  they carry no Back buttons or appearance menus of their own, the title bar does that.
  The editor routes and `/lti/register` stay outside the shell.
- Import with the `@/` alias, not deep relative paths. Shared graph types come from
  `@haski/ta-lib`.
- UI is MUI 7 with the Emotion `css` prop (`jsxImportSource` is configured); use MUI
  components and `sx`/`css` rather than new CSS files.
- Routes are declared in `src/routes.tsx`. A route that needs a workflow takes it from the
  path; the editor must not invent one when the segment is missing.
- Editor state flows through the existing hooks — `useSocket`, `useServerEvents`,
  `useAutosave`, `useGraphHistory`, `useGraphOperations` — rather than new ad-hoc effects
  around the LiteGraph instance.
- The LiteGraph canvas renders at device pixel ratio (`@/utils/canvasPixelRatio`), so
  `canvas.canvas.width/height` are backing pixels while LiteGraph's screen space
  (`convertOffsetToCanvas`, mouse events) stays in CSS pixels. Viewport maths goes through
  `canvasCssSize`/`canvasViewportCenter`; never derive a scale from the bitmap size.
- Participant-facing preview strings belong in `@/i18n/preview` (EN and DE), never inline
  in a component; the preview's question and answer-length bounds come from the open graph
  through `useWorkflowForm`, not from run events or component defaults.
- Handle `ApiError` by its `body.code` (for example a version conflict carrying
  `currentVersion`), not by message text.
- Prettier here means no semicolons, single quotes, no trailing commas, 90 columns;
  imports are sorted by `eslint-plugin-simple-import-sort`. `lint:check` allows zero
  warnings.
