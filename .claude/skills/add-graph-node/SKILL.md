---
name: add-graph-node
description: Add or change a LiteGraph node type in packages/lib so the palette, inspector, saved graphs and server-side execution all stay consistent. Use when asked to add a node, block, widget-driven property, or model-calling node to the graph editor.
---

# Add a graph node type

Node types live once, in `packages/lib/src/nodes/`, and both the editor and the server use
them. Miss a step and the node exists but never appears in the palette, or appears but
fails on execution.

## Steps

1. **Read a close neighbour first.** Pick the nearest existing node —
   `ExtractNumberNode.ts` (pure transform), `KeywordCheckNode.ts` (worker call plus
   toggle), `LLMNode.ts` (model call plus widgets) — and follow its shape.

2. **Create `packages/lib/src/nodes/<Name>.ts`.**
   - Extend `LGraphNode` from `./litegraph-extensions`, not litegraph's own class.
   - Declare `static path = '<group>/<name>'` and `static getPath()`; the path string is the
     persisted node type and must not change once graphs are saved with it.
   - Wire ports in the constructor with `addIn`/`addOut` (the inherited `addInput`/
     `addOutput` throw), widgets with `addWidget`.
   - A port may accept several types: pass an array, `addIn(['message', 'string'], 'message')`.
     The first member is the primary type and decides the port's colour and shape.
   - Overriding `onConfigure`? Call `super.onConfigure(info)` first, or the node loses the
     shared port styling and the declared port types on load.
   - Implement `onExecute` (async) reading `getInputData(slot)` and writing
     `setOutputData(slot, value)`.
   - Need an HTTP worker? Implement `init(env)` and read `env.MODEL_WORKER_URL` or
     `env.SIMILARITY_WORKER_URL`; the backend assigns `node.env` before every run.
   - Need a language model? Use `runtime?: ModelCompletionRuntime` and a `ModelRef`
     property with `control: { type: 'model' }`. Never read credentials or provider URLs.
   - Long work should respect `executionSignal` so cancellation works.

3. **Export it** from `packages/lib/src/nodes/index.ts` (import line and export block).

4. **Register it** by appending an entry to the `entries` array in
   `packages/lib/src/nodes/NodeDefinitionRegistry.ts`:

   ```ts
   {
     node: MyNode,
     category: 'Validation',            // Essential | AI | Assessment | Validation
     description: 'One sentence shown in the palette.',
     properties: [text('separator', 'Separator', true)]
   }
   ```

   This single entry drives LiteGraph registration, the palette and the inspector. The
   `keyValue` flag (third argument of the `text`/`textarea` helpers) marks properties that
   are editable as key/value pairs.

5. **Only if the node stores properties in widgets** that older saved graphs carry: add its
   `path` and widget key order to `legacyWidgetKeys` in the same file, so
   `loadLegacyWidgetProperties` can restore them.

6. **Build the library**: `yarn workspace @haski/ta-lib build`. The backend imports `dist`,
   so skipping this makes the node invisible server-side.

7. **Verify**, narrowest first:

   ```bash
   yarn workspace @haski/ta-frontend test:run src/utils/nodeDefinitions.test.ts
   yarn workspace backend test --testPathPattern graph-handler
   yarn typecheck
   ```

   For a model-calling node also run
   `yarn workspace backend test --testPathPattern llmnode`.

## Do not

- Register nodes in `packages/frontend/src/utils/registernodes.ts` — it is legacy and
  unreferenced.
- Add node-specific branches to `NodePalette.tsx` or `NodeInspector.tsx`; they render from
  the definition metadata.
- Rename an existing `static path`: that breaks every stored graph. Add a new type instead.
