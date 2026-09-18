# LiteGraph Hook Order and Pitfalls

Learned the hard way in this session. Read before touching title/port drawing.

## Paint order in `drawNode` → `drawNodeShape`

1. Node body fill (`bgcolor`)
2. `onDrawBackground`
3. Title-bar fill — `node.color || constructor.color || NODE_DEFAULT_COLOR`
   when `render_title_colored` (default true). **Never set constructor `color`
   to a saturated category tint**: gray `#999` title text on teal/violet is
   unreadable. Keep the bar dark, signal category via pill + `boxcolor` dot.
4. Status dot — `onDrawTitleBox` if defined, else default circle/square.
5. `onDrawTitleText` if defined.
6. **Default title string always paints after both hooks.** There is no
   "replace title" hook — `onDrawTitleText` runs *in addition to* the default
   text, not instead of it.

## Consequences

- A pill drawn in `onDrawForeground` always ends up **under** the title text
  (foreground runs before the title pass). Dead end for title pills.
- A pill drawn in `onDrawTitleText` gets **overpainted** by the default title
  text that follows. Dead end too.
- Correct split: pill in `onDrawTitleBox` (runs before text, above bar
  background) + title clipping in `onDrawTitleText` (clip rect ending at the
  pill gutter, then reproduce the standard fill — LiteGraph exposes no
  "default title text" helper to delegate to).
- `compactNodeWidgets` wraps `onDrawForeground` via `previousDraw` chain, so
  it never clashes with title hooks. Keep it that way: preview text in
  foreground, pill in title box.

## Shape dispatch gotcha

`drawNode` computes `shape = node._shape || BOX_SHAPE`. `NODE_DEFAULT_SHAPE`
is a string key (`'round'`) that is never resolved per node — setting it does
nothing. Each node class needs `Node.prototype.shape = 'round'` (through
LiteGraph's shape setter → `_shape = ROUND_SHAPE = 2`), otherwise nodes fall
into the `BOX_SHAPE` title-box branch and a round-branch `onDrawTitleBox`
never fires. Symptom: hook exists on the prototype, call count stays 0.

## Slot shapes

Runtime exposes `BOX_SHAPE` 1, `CIRCLE_SHAPE` 3, `ARROW_SHAPE` 5,
`GRID_SHAPE` 6. The shipped `.d.ts` misnames 6 as `SQUARE_SHAPE` — `tsc`
rejects `LiteGraph.GRID_SHAPE`, so the value is inlined as `const
GRID_SHAPE = 6` with a comment. Mapping: circle = scalar
(`string`/`number`/`boolean`/`image`), arrow = `message`, grid =
`[number]`/`[string]`, box = `*`.

## `onConfigure` signature

Base declares `onConfigure(_info?: unknown)`. Subclasses (e.g. `LLMNode`)
extend the parameter — keep the base optional/unknown or every subclass
assignment breaks `tsc` (`TS2416`). `onConfigure` must reapply port
color + shape: `configure()` overwrites slots with serialized values, and old
graphs carry translucent colors with no shape.
