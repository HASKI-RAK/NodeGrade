---
paths:
  - "packages/lib/**/*.ts"
---

# Shared graph library rules (`@haski/ta-lib`)

- This package may not import the backend or the frontend. Both applications import it,
  so anything platform-specific (Prisma, Nest, React, `window`) is out of bounds.
- Nodes extend the project's `LGraphNode` from `./litegraph-extensions`, declare
  `static path`, and use `addIn`/`addOut` plus widgets. Model calls go through
  `runtime?: ModelCompletionRuntime`; nodes never hold credentials or provider URLs.
- A node is only usable once it is listed in the `entries` array in
  `nodes/NodeDefinitionRegistry.ts`. That array drives LiteGraph registration
  (`LGraphRegisterCustomNodes`), the palette and the inspector; there is no second
  registration site.
- A port accepts one type or several: `addIn('string')` or `addIn(['message', 'string'])`.
  The first member is the primary type and decides the port's colour and shape. Declared
  port types are restored by `LGraphNode.onConfigure`, so a node that overrides
  `onConfigure` must call `super.onConfigure(info)` or stored graphs load with the slot
  types they were saved with.
- A node that wants trace detail beyond its output slots sets `executionDetails` during
  `onExecute`. It is transient, cleared by the runner, and sanitized like an output.
- Property metadata belongs in the registry entry (`NodePropertyDefinition` controls), not
  in ad-hoc inspector code. Widget-backed legacy properties must be listed in
  `legacyWidgetKeys` so old saved graphs still load.
- Socket payload and trace types in `events/ServerEvents.ts` are a contract shared with the
  backend gateway and the frontend hooks. Changing a payload means changing all three, and
  stored graphs must keep loading.
- Model choices are `ModelRef` values (`providerKey` + model id). Do not reintroduce bare
  model-name strings; `packages/backend/src/migration/` exists to undo that.
- After any change here run `yarn workspace @haski/ta-lib build`, otherwise backend
  typecheck and jest run against a stale `dist`.
