# Verify-Page Bundle and Render-Loop Gotchas

## `dist` is CommonJS — browsers reject it

`@haski/ta-lib` compiles to CommonJS (`"module": "CommonJS"`). Importing
`packages/lib/dist/index.js` from a `<script type="module">` fails with
`exports is not defined`. Do not fight it: bundle a small entry with esbuild
against **`src`**, not `dist`:

```bash
node_modules/.bin/esbuild <entry>.ts --bundle --format=iife --platform=browser \
  --external:ws \
  --alias:@haski/ta-lib=./packages/lib/src \
  --alias:litegraph.js=./node_modules/litegraph.js/build/litegraph.core.js \
  --outfile=<out>-bundle.js
```

## Dedupe litegraph

Without the second alias, esbuild bundles **two** litegraph copies (the
`build/litegraph.js` main entry plus the core). Registration then lands on a
different `LiteGraph` object than the canvas reads: `title_text_color` set,
screenshot unchanged, zero errors. Symptom of a dual copy: headless dump
correct, browser screenshot stale. Always alias to `build/litegraph.core.js`.

## Render loop is dirty-flag gated + culls

- `draw()` only repaints when `dirty_canvas`/`dirty_bgcanvas` (or forced).
  A single `draw(true, true)` paints once; the rAF loop then idles. A
  hook-call counter stalls (e.g. stuck at 2/7) while the screenshot looks
  half-painted.
- `computeVisibleNodes` culls offscreen nodes. Nodes outside the viewport
  never fire hooks.
- Fix used in the template: force `canvas.draw(true, true)` every frame via
  rAF until `titleHookCalls >= nodeCount`, then `stopRendering()` for a
  deterministic screenshot. Keep all demo nodes inside an 1100×640 viewport
  at scale 1.
- `page.locator('#wrap').screenshot()` can time out on "element not stable"
  while the loop runs — freeze the loop first, or fall back to
  `page.screenshot()`.

## `__nodeStyle` probe contract

The entry exposes `window.__nodeStyle` with `titleColor`, per-node
`titleTextColor`/`boxcolor`/`category`/`categoryFill`, and
`titleHookCalls()`/`titleBoxCalls()` counters. Wait for
`titleHookCalls() >= nodeCount` before screenshotting. Counts of 2 with 7
nodes mean culling or dirty-gating, not broken hooks — check the loop before
the code.
