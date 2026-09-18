---
name: debug-graph-canvas
description: Debug NodeGrade graph canvas styling visually with real LiteGraph rendering. Use when node titles, pills, port colors, port shapes, wires, or title-bar styling look wrong, when a canvas change needs a screenshot proof, or when LiteGraph hooks (onDrawTitleBox, onDrawTitleText, onDrawForeground) misbehave.
---

# Debug Graph Canvas Visually

Render the real `LGraphCanvas` (never a mockup) and prove styling with hook-call
counts plus screenshots. Headless checks are fast; screenshots are truth.

## When to Use

- Title text unreadable, pill overlapping title, wrong bar fill
- Port dots all one color, shapes missing, wires glowing or wrong color
- Any change to `LGraphNode.ts`, `LGraphRegisterCustomNodes.ts`, `Canvas.tsx`
- User asks "verify the result" for canvas work

## Procedure

### 1. Headless style dump (fast, no browser)

Rebuild first — backend and tests run against `dist`, not `src`:

```bash
yarn workspace @haski/ta-lib build
node -e "
const m = require('./packages/lib/dist/index.js');
m.LGraphRegisterCustomNodes();
const { LiteGraph, LGraph } = m;
const g = new LGraph();
for (const t of ['basic/prompt-message','utils/concat-object','models/llm']) {
  const n = LiteGraph.createNode(t); g.add(n);
  console.log(t,
    [...(n.inputs||[]), ...(n.outputs||[])].map(s => s.type + ' ' + s.color_on + ' shape=' + s.shape).join(' | '));
  console.log('  title_text_color=' + n.constructor.title_text_color,
    'boxcolor=' + n.boxcolor, 'shape=' + n.shape + '/' + n._shape);
}
console.log('TITLE_COLOR=' + LiteGraph.NODE_TITLE_COLOR, 'BG=' + LiteGraph.NODE_DEFAULT_BGCOLOR);
" 2>&1 | grep -v "replacing node"
```

Or run the bundled script:

```bash
node .claude/skills/debug-graph-canvas/scripts/dump-node-style.cjs
```

Expected output (abbreviated): `string on=#4ADE80 shape=3`,
`message on=#FACC15 shape=5`, `[number] on=#22D3EE shape=6`, `* on=#E2E8F0
shape=1`, `title_text_color=#F5F7FA`, node `shape=2/2` (round),
`TITLE_COLOR=#F5F7FA BG=#2B2D3A`.

### 2. Legacy-graph restyle check

Old saved graphs carry translucent colors and no shape. `onConfigure()` must
heal them. Prove it:

```bash
node -e "
const m = require('./packages/lib/dist/index.js');
m.LGraphRegisterCustomNodes();
const { LiteGraph, LGraph } = m;
const g = new LGraph();
const n = LiteGraph.createNode('basic/prompt-message'); g.add(n);
n.inputs[0].color_off = '#00FF0060'; n.inputs[0].shape = undefined;
const ser = JSON.parse(JSON.stringify(g.serialize()));
const g2 = new LGraph(); g2.configure(ser);
const r = g2.getNodeById(n.id);
console.log('in:', r.inputs[0].color_on, r.inputs[0].color_off, 'shape=' + r.inputs[0].shape);
" 2>&1 | grep -v "replacing node"
```

Expected: `#4ADE80 #4ADE80 shape=3`.

### 3. Browser screenshot (truth)

`dist` is CommonJS (`exports is not defined` in browsers). Bundle a verify
page with esbuild — see [template](./assets/verify-entry.template.ts) and
[script](./scripts/bundle-verify-page.sh):

```bash
node_modules/.bin/esbuild <entry>.ts --bundle --format=iife --platform=browser \
  --external:ws \
  --alias:@haski/ta-lib=./packages/lib/src \
  --alias:litegraph.js=./node_modules/litegraph.js/build/litegraph.core.js \
  --outfile=<out>-bundle.js
python3 -m http.server 18918 --directory . &
# open http://localhost:18918/<page>.html, screenshot #wrap, read __nodeStyle
```

The template wires: legend chips from `LINK_TYPE_COLORS`, 7 demo nodes with
the real connections, flat-wire canvas flags, hook-call counters, and a
forced repaint loop. Wait for `titleHookCalls() >= nodeCount` before
screenshotting — the render loop is dirty-flag gated and culls offscreen
nodes otherwise.

### 4. Verify, narrowest first

```bash
yarn typecheck
yarn workspace @haski/ta-frontend test:run src/utils/nodeDefinitions.test.ts
yarn lint:check
```

Then the wider suites only if green:
`yarn workspace @haski/ta-frontend test:run`,
`yarn workspace backend test --testPathPattern "graph-handler|llmnode|workflow"`.

Delete the verify scaffolding afterwards (`verify-entry.ts`,
`verify-bundle.js`, `verify-title.html`); keep the PNG evidence.

## References

- Hook order and pitfalls: [litegraph-hooks](./references/litegraph-hooks.md)
- Bundle + render-loop gotchas: [verify-page](./references/verify-page.md)
- Entry template: [verify-entry.template](./assets/verify-entry.template.ts)
- Headless dump: [dump-node-style](./scripts/dump-node-style.cjs)
- Bundle helper: [bundle-verify-page](./scripts/bundle-verify-page.sh)
