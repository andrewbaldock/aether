# Design System

The tokens, primitives, and shared shells the frontend is built from — the *how*. The design
*why* (palette philosophy, type voice, motion intent, the guiding principles) is
[DESIGN_LANGUAGE.md](./DESIGN_LANGUAGE.md). This is the single place the mechanics live;
architecture is [ARCHITECTURE.md](./ARCHITECTURE.md), the dependency rationale is
[STACK.md](./STACK.md), mobile/responsive specifics are [MOBILE.md](./MOBILE.md).

**See it live, not just described:** the `/style-guide` admin page (Style Guide tab, next to
Settings/Health) renders every color token, the type scale, the spacing rhythm, a couple of
primitives, both icon-button variants, the ARIA conventions, and the five Bigsail widget
skeletons — pulled from the running app, not a mockup.
Source: [`frontend/src/capabilities/widgets/StyleGuide/`](../frontend/src/capabilities/widgets/StyleGuide/).

---

## The short version

- **Tokens, not hardcoded values** — color, typography, and theme are centralized; components
  consume semantic classes (`bg-surface`, `text-content-muted`), not raw hex/px.
- **One shared shell per system** — every Bigsail widget gets its chrome (drag handle,
  flip-to-reveal, skeleton entrance) from a single `CardShell`; every admin page gets its chrome
  from a single `AdminPage`. New widgets/pages implement content only.
- **Radix + Tailwind, no component library** — accessible primitives (focus trap, Escape, ARIA)
  come from Radix; visual styling is Tailwind utilities over the token set. No shadcn/Chakra.
- **One motion language** — shared CSS keyframes and a consistent `--i`-driven stagger convention,
  reused across tiles, table rows, and prompt chips, with `prefers-reduced-motion` respected
  throughout.

---

## Design tokens

Registered once, in [`frontend/src/index.css`](../frontend/src/index.css), as a Tailwind v4
`@theme` block:

```css
@theme {
  --color-surface: var(--surface);
  --color-content: var(--content);
  --color-accent: var(--accent);
  /* … */
}
```

Each `--color-*` points at an intermediate variable (`--surface`, `--content`, …) defined twice —
once under `:root` (light) and once under `.dark` — so the utility class (`bg-surface`) never
changes; only the value it resolves to flips. That indirection is the entire theming mechanism:

- **Switch:** [`frontend/src/theme/useTheme.tsx`](../frontend/src/theme/useTheme.tsx) toggles the
  `.dark` class on `<html>`, persists the choice to `localStorage`, and falls back to
  `prefers-color-scheme` until the user picks explicitly.
- **Zero-flash boot:** a pre-paint inline script in `frontend/index.html` applies the class before
  React mounts, so there's no flash of the wrong theme on load.
- **Typography scale:** [`frontend/src/theme/useAppearance.tsx`](../frontend/src/theme/useAppearance.tsx)
  defines a 4-step text-size scale (`xs:14 / sm:15 / md:16 / lg:18`) applied via the root
  `font-size` — every rem-based Tailwind size scales with it — plus a font-face stack
  (system/Geist/Georgia/Lora).
- **Spacing:** one authored variable, `--spacing: 0.25rem`, declared in the `@theme` block.
  Tailwind v4 compiles *every* spacing utility against it — `p-4` emits
  `calc(var(--spacing) * 4)`, `gap-2` emits `calc(var(--spacing) * 2)`, and likewise for margin,
  width, height, inset, and translate. So the app's entire rhythm is a single number: change it and
  everything rescales in proportion, with no component edits.

  4px is *chosen*, not merely inherited — it's the smallest step that divides the 44px minimum
  touch target evenly (11 steps) and keeps the common sizes on whole pixels. It's declared
  explicitly even though it equals Tailwind's default, because an undeclared default is not a
  decision: without the line, nothing records that the rhythm was considered and nothing tells the
  next person where to change it.

  > Named `--space-1..12` tokens were considered and **rejected**. They'd sit *beside* the
  > utilities rather than behind them, so using them would mean migrating every component to
  > arbitrary values (`p-[var(--space-4)]`) — more code, worse code — while `p-4` kept routing
  > through `--spacing` anyway. Authoring the variable the framework already reads is the smaller
  > and more honest change.

> **Rule of thumb:** a new color needs an entry in both the `@theme` block and both `:root`/`.dark`
> value blocks. Never reach for a raw hex in a component — if the token you need doesn't exist,
> add it here first.

### The data-viz ramp (`--viz-1` … `--viz-8`)

Chart series colours are a **categorical ramp**: eight slots, defined per theme in `:root`/`.dark`
and handed to Recharts as `var(--viz-N)` strings. Recharts writes them straight into SVG
`fill`/`stroke`, and the browser resolves the custom property like any other CSS value — so a chart
re-colours itself on a theme flip with **no JS and no re-render**. `ChartWidget.tsx` contains no
colour values and no theme awareness.

Three properties are load-bearing, and all three are easy to break by accident:

1. **The order is the colourblind-safety mechanism, not a preference.** Adjacent slots are
   validated for separation under protanopia/deuteranopia (OKLab ΔE ≥ 8 target; worst adjacent pair
   is 9.1 light / 8.4 dark) plus a normal-vision floor of ΔE ≥ 15 (19.6 / 19.3). Slots are assigned
   in sequence, never shuffled per chart. Re-ordering the ramp silently voids the guarantee — so
   re-validate if you touch it.
2. **Both modes are selected, not flipped.** The `.dark` column is the same eight hues re-stepped
   for the near-black surface.
3. **The brand pink is deliberately absent.** `--accent` means "you can click this"; a pink series
   would read as an affordance. Identity and action stay on separate channels.

Three light-mode slots (aqua, yellow, magenta) sit below 3:1 contrast on white. That's permitted
only because the values are readable another way — axis ticks, the hover tooltip, and the legend's
text labels. Keep that relief if you change them.

Two related rules the chart follows:

- **Legend text wears text tokens, never the series colour** (`LEGEND_PROPS` in `ChartWidget.tsx`).
  The swatch beside the label already carries identity; painting the label too spends the channel
  twice and makes poor body text.
- **A single-series bar chart uses slot 1 for every bar.** Bar *length* already encodes the value,
  so colouring each bar differently re-encodes what the reader can already see.

> ⚠️ **The ramp is NOT registered in `@theme`** — the one deliberate exception to the rule above.
> Tailwind v4 tree-shakes `@theme` entries that no utility class references, so a `--color-viz-*`
> declared there resolves to the **empty string** at runtime: charts render with no stroke and no
> error. These are consumed as raw values, never as classes, and a per-series class name would be
> dynamic (`bg-viz-${i}`) which Tailwind can't see statically either. Plain `:root`/`.dark` custom
> properties give the same indirection with nothing to tree-shake.

### The knowledge-graph entity palette (`--kg-*`)

A *second* categorical set, for the five entity types in the graph. Separate from `--viz-*` because
it answers a different question ("what kind of thing is this node") and because two slots are
load-bearing brand: `kg-person` is `--neon-pink`, `kg-concept` is the wordmark's mid gradient stop.

The previous values lived as hex literals in `colors.ts` and were tuned for the dark canvas. Measured
against white they failed: `place` 2.06:1, `org` 2.03:1, `event` 1.92:1 — visibly washed out. Those
three were re-stepped; the two brand ties already passed and are untouched.

**One set serves both themes** — declared once under `:root`, inherited by `.dark`. That's a measured
result, not a shortcut: requiring a colour to clear 3:1 on white *and* on the near-black canvas pins
it to a narrow mid-lightness band, and searching both surfaces jointly collapsed the feasible region
to a single palette. (Contrast `--viz-*`, where the two surfaces genuinely want different steps.)

Validated on both surfaces under **all pairs** — the harder test, correct for a force graph where any
two nodes can drift adjacent: band, chroma and contrast pass; normal-vision floor ΔE 15.4; worst CVD
pair `concept`↔`place` ΔE 7.0 (deutan).

> ⚠️ That 7.0 is in the **6–8 floor band**, legal *only* alongside secondary encoding. The graph has
> it — every node renders a lucide icon, a text label, and an `aria-label`. Five hues cannot clear
> ΔE 8 all-pairs (no ordering of five can), so those labels are not a nicety: they are what makes the
> palette valid. Removing them would retroactively invalidate it.

Live examples: the **Data-viz ramp** and **Knowledge-graph entities** sections of `/style-guide`, and
**Widgets/Chart palette** in Storybook. Both read the ramp through `VIZ_RAMP` in
[`parseTokens.ts`](../frontend/src/capabilities/widgets/StyleGuide/parseTokens.ts), which parses
`index.css` itself — so neither can drift from the CSS.

## Editorial prose (the chat answer)

An assistant answer is not a chat bubble of flat text — it's **set like a designed page**. The
chat is one of Aether's "two panes, two jobs": the panels beside it carry the data, and the prose
is meant to be a genuinely good read on its own. So the renderer treats the Markdown the model
already writes as editorial typography.

**Renderer:** [`frontend/src/shell/ProseMarkdown.tsx`](../frontend/src/shell/ProseMarkdown.tsx) —
`react-markdown` + `remark-gfm` + `remark-directive`, wrapped in a `.prose-editorial` element whose
styles live in `index.css` (search `── Editorial prose`). `ChatPanel` just renders
`<ProseMarkdown text={m.text} />`. Body text keeps the user's chosen font (`--font-body`); only
**display** elements (headings, drop cap, stat numbers, pull-quotes) use `--font-display` (Space
Grotesk). Colours are theme tokens, so light/dark track for free.

**Two variants, chosen by content.** A substantial answer (has a heading, uses a directive, or is
simply long) gets `data-variant="article"`: a larger reading measure, a **standfirst** lead
paragraph, and a **drop cap**. A short reply stays `data-variant="compact"` (today's plain look) —
so a one-line answer never gets an absurd drop cap. The drop cap + standfirst target
`.prose-body > p:first-of-type` (the first *real* content paragraph), never the preamble.

**Automatic treatments** (from the Markdown the model already writes): `##` headings become section
titles with a lotus `𑁍` tick + hairline rule; `---` becomes a lotus divider; blockquotes become
accent-ruled quotes; images become captioned figures; lists get lotus bullets.

**Directive palette** (art-direction the model opts into, taught in `backend/src/prompt.ts` under
"Composition palette" — used with restraint, most answers use none):

| Directive | Renders as |
|---|---|
| `:::lead` … `:::` | Force a standfirst/lead block |
| `:::pullquote{cite="…"}` … `:::` | A pulled phrase, set large in the display font |
| `:::callout{title="…"}` … `:::` | A boxed key takeaway on `--elevated` |
| `:::aside` … `:::` | A margin note; floats beside the column on wide article layouts |
| `::stat[value]{label="…"}` | A big figure + caption |
| `:accent[…]` | Inline emphasis in the brand accent |

A tiny local remark plugin (`remarkDirectiveElements`) maps directive nodes to `div`/`span` tagged
with `data-directive`; the `components` map styles the known ones and **degrades unknown/malformed
directives to plain content** — a stray `:::` never leaks literal colons, and an unknown inline
`:name` is reconstructed so technical prose like `namespace:function` keeps its text.

**Staging vs. content.** The model narrates before its tools ("Let me pull the figures…", "Now
I'll render the chart…"). That's scaffolding, not the answer, and is separated out at two layers:
the **backend persists only the answer** (see
[ARCHITECTURE.md](./ARCHITECTURE.md#staging-vs-content--only-the-answer-is-transcript)), and the
renderer's `splitPreamble` peels any remaining **leading staging chain** into quiet muted
`.prose-preamble` notes so the editorial treatment lands on real content. Legacy transcripts clean
themselves via a lazy backfill on load. New turns are clean at the source, so `splitPreamble` is
mostly a live-streaming and legacy fallback.

**See it live:** the `/style-guide` page has an "Editorial prose" specimen exercising every element
and the full directive palette (plus a malformed directive proving graceful degradation) — no LLM
call needed.

## Widget shell (Bigsail)

Every card on the Bigsail canvas — table, chart, timeline, images, knowledge-graph — renders
through one shared wrapper: `CardShell` in
[`frontend/src/capabilities/widgets/Bigsail/TilesCanvas.tsx`](../frontend/src/capabilities/widgets/Bigsail/TilesCanvas.tsx).
It owns everything that isn't the widget's own content:

- The drag handle strip and title header.
- The **flip-to-reveal** mechanism — a 3D CSS transform (`perspective` + `rotateY(180deg)` +
  `backface-visibility: hidden`) to a back face
  ([`CardBack.tsx`](../frontend/src/capabilities/widgets/Bigsail/CardBack.tsx)) showing an editable
  summary, a Regenerate button, and the raw JSON spec. Implemented once; every widget type gets it
  for free.
- The **skeleton entrance** — a distinct silhouette per widget type
  ([`SkeletonCard.tsx`](../frontend/src/capabilities/widgets/Bigsail/SkeletonCard.tsx)) sharing one
  `tiles-skeleton-shimmer` sweep and one `tiles-skeleton-in` cascade (both in `index.css`), so the
  canvas hints at each answer's shape before any data lands.
- Settings/hide/duplicate actions.

**Drag and resize are inherited, not implemented per widget.** GridStack owns the grid — item DOM,
drag, resize, compaction — via `GridStack.init()`
([`TilesCanvas.tsx`](../frontend/src/capabilities/widgets/Bigsail/TilesCanvas.tsx)); React only
renders content into GridStack-created wrappers through a portal. No widget component contains any
GridStack-aware code.

A new widget type only has to implement `Spec*` (its content renderer) — the shell, flip, skeleton,
and drag/resize come free.

## Admin page shell

The non-conversation utility pages (Welcome, Settings, Health, Style Guide) share one wrapper,
`AdminPage` ([`frontend/src/shell/AdminPage.tsx`](../frontend/src/shell/AdminPage.tsx)) — scroll
container, max-width, padding, and an `AdminTabs` slot — plus the shared `AdminTabs` nav
([`frontend/src/shell/AdminTabs.tsx`](../frontend/src/shell/AdminTabs.tsx)). Before this existed,
each page rolled its own chrome and navigating between them made the column visibly jump (width
changing, the tab bar sliding, the heading resizing); the wrapper makes them read as one surface
you're switching tabs within.

Adding a new admin page: register a renderer, export a `{ id, type, title, state }` descriptor
(see any `widgets/*/index.tsx`), add it to `AdminTabs`' tab list and to `AdminPageId` /
`ADMIN_PATHS` in [`frontend/src/hooks/useRoute.ts`](../frontend/src/hooks/useRoute.ts), and wrap
its content in `<AdminPage title="…">`.

## Routing & deep links

A small custom router ([`frontend/src/hooks/useRoute.ts`](../frontend/src/hooks/useRoute.ts) — no
external routing library) supports four URL shapes: `/`, `/:view`, `/c/:id`, `/c/:id/:view`, where
`:view` is a human-readable slug mapped to a capability (`/c/abc123/chart`). Every conversation and
every open tool tab is a shareable, cold-loadable URL. Admin pages (`/welcome`, `/settings`,
`/health`, `/style-guide`) are flat, conversation-agnostic paths handled by the same parser.

Widget *configuration* (not just which tab is open) is not URL-encoded — it lives in a persisted
`ui_state` blob, restored on session load.

## Primitives & composition

Radix UI (`AlertDialog`, `Tooltip`, `Select`) is the accessible foundation — focus trap, Escape,
outside-click, and ARIA roles come from it, not hand-rolled. Custom shell components
(`Tooltip.tsx`, `ConfirmDialog.tsx`, `ModelPicker.tsx`, …) wrap Radix primitives with the app's
token-driven styling and use Radix's `asChild` pattern so a caller's own layout classes keep
working on the trigger element. There's no packaged component library (shadcn/Chakra) and no
custom compound-component API beyond what Radix provides — composition here means "wrap a Radix
primitive," not "build a `<Tabs.List>`-style system."

### Buttons

`shell/Button.tsx` is the shared **text** button; `IconButton` remains the icon-only one.

It was added late, after an audit found **21 files hand-rolling their own** `rounded-lg … px-3 py-1.5 …`
string. The drift was already measurable: the neutral treatment existed with four different hover
rules, and two files disagreed about whether `disabled` meant 40% or 50% opacity.

Three variants, **derived from what the app already used** rather than invented:

| Variant | Use | Hand-rolled copies it replaced |
|---|---|---|
| `primary` | the affirmative action | 3 |
| `secondary` | the neutral default | 7 (with the drift) |
| `danger` | destructive confirmation | 1 |

There is deliberately no `tertiary`, no `size`, and no `loading` — none had a real call site, and an
unused variant is just a decision imposed on the next person.

Two things worth knowing:

- **It forwards a ref**, so it works as a Radix `asChild` trigger. `IconButton` can't (it returns a
  `<Tooltip>` wrapper), which is why `ExploreMenu` still hand-rolls a raw `<button>` off
  `ICON_BUTTON_CLASS`. `ConfirmDialog`'s Cancel/Confirm are now `<Button>` inside
  `AlertDialog.Cancel asChild` directly. **Exception:** passing `tooltip` wraps it in a Tooltip tree,
  so a tooltipped Button cannot also be an `asChild` trigger.
- **Tooltips are opt-in.** A text button already has an accessible name, so a tooltip repeating the
  label is noise for pointer users and a duplicate announcement for screen readers. Use it for what
  the label can't say — a shortcut, or a consequence. (`IconButton` is the opposite: there the
  tooltip *is* the name.)

`buttonClass(variant, extra)` is exported for the rare button that genuinely can't be this component.

### Floating surfaces (`OVERLAY_SURFACE`)

`shell/overlay.ts` names the elevation treatment for anything that floats above the page — dialogs,
menus, dropdowns, the mobile sheet.

This one is worth reading for how it turned out, not just what it is. It was opened as a suspected
drift (five copy-pasted class strings across five files) and turned out to be the opposite: the
surfaces were already following a consistent **two-tier** rule. It just had no name and no single
place to change it.

| Tier | Used by | Treatment | Why |
|---|---|---|---|
| `modal` | `ConfirmDialog`, `EditWidgetDialog` | `rounded-xl` + `shadow-2xl` | takes the whole screen's attention behind a scrim; the user must deal with it |
| `popover` | `ModelPicker`, `ExploreMenu` | `rounded-lg` + `shadow-lg` | anchored to its trigger, dismissed by looking away — should read as attached to the page |
| `sheet` | `ToolInfoSheet` | `rounded-t-2xl` + `border-t` + `shadow-2xl` | mobile bottom sheet; only its top edge is ever on screen |

All three keep `border-border-strong`: on the raised surface a floating panel needs a harder edge
than inline content, or it dissolves into the page beneath it in dark mode.

**The one genuine inconsistency it fixed:** the bottom sheet carried `border-border` rather than
`border-border-strong` — and that top edge is the only part of the sheet's frame a user ever sees.

**Positioning is deliberately not in the constant.** Each call site keeps its own fixed/absolute
placement, z-index, width clamps, and padding — those are per-overlay and Radix often drives them.
A wrapper component would have to fight Radix for control of exactly those properties, which is why
this is a class constant (like `ICON_BUTTON_CLASS` and `buttonClass`) rather than a `<Panel>`.

> Related, and deliberately **not** done: a general `<Panel>` component. An audit of 41
> `rounded + border + bg` usages found they are at least five different things (content panels,
> pills, floating surfaces, segmented-control tracks, icon-button drift), and 16 of the 21
> "content panel" uses are inside the Style Guide and Theme Lab — demo pages whose job is drawing
> boxes. Real product usage is about five, which is a Tailwind class working correctly, not a gap.

### Text fields

`shell/Input.tsx` exports `Input` and `Textarea`. Found by the same audit as `Button`: **six text
fields across four files, no two styled alike**.

Unlike the buttons, the fix was *not* to force one look. Two of those fields were doing a different
job, so both treatments survive as named variants:

| Variant | Where | What the styling says |
|---|---|---|
| `field` (default) | dialogs, panels (`EditWidgetDialog`, `CardBack`) | "this is a form control" — bordered on the page surface |
| `inline` | sidebar rename, chat title | "the text you were reading is now editable" — filled + ring |

An inline rename with a form border reads as a form that appeared from nowhere; a dialog field with
a filled background reads as disabled.

**Two things deliberately stay raw**, both noted in source so the next person doesn't "fix" them:
the chat composer `<textarea>` (transparent and borderless — the box around it owns the border,
loading animation, and drop ring) and the hidden `<input type="file">` (no field styling at all,
clicked programmatically).

`Textarea` defaults to `resize-none`: every one lives in a sized container where a drag handle
breaks the layout. `inputClass(variant, extra)` is exported for the rare field that can't be these.

### Icon buttons

Every icon-only button is the shared `IconButton`
([`frontend/src/shell/IconButton.tsx`](../frontend/src/shell/IconButton.tsx)) — a Tooltip-wrapped
`<button>` where `label` doubles as the aria-label and the tooltip text. It has two variants
(`ICON_BUTTON_CLASS`, exported so a raw `<button>` that can't wrap in `<Tooltip>` — e.g. an
`AlertDialog` trigger — can still read its class from the same source instead of hand-copying it):

- **`chrome`** (default `stopPointerDown`) — naked, recedes until hovered/focused. Used for
  Bigsail card drag-handle actions (flip, duplicate, hide) in
  [`TilesCanvas.tsx`](../frontend/src/capabilities/widgets/Bigsail/TilesCanvas.tsx), where it also
  swallows its own `pointerdown` so a click doesn't start a GridStack drag.
- **`nav`** — bordered, muted until hover/active. Used by `HelpButton.tsx` and `ThemeToggle.tsx`
  (sidebar/toolbar utilities).

**Not migrated, deliberately:** the capability toolbar's right-cluster utility chips
(`CapabilityChip` with `bare`, in
[`CapabilityColumn.tsx`](../frontend/src/shell/CapabilityColumn.tsx)) and the fullscreen toggle
button in the same file look like icon buttons but are coupled to the toolbar chip's
active/filled/glow state machine and footprint — they stay bespoke rather than forcing a shared
component to also model chip state.

Live examples of both variants: `/style-guide` → "Icon buttons".

## Accessibility (ARIA)

Radix primitives carry their own semantics (roles, focus trap, Escape, `aria-modal`); the
conventions below cover everything hand-rolled. Live specimens: `/style-guide` →
"Accessibility (ARIA)".

- **Icon-only controls are named once** — `IconButton`'s `label` prop feeds both the
  `aria-label` and the tooltip text, so the accessible name can't drift from what sighted
  users see. A raw button that can't use `IconButton` still sets `aria-label` by hand.
- **Decorative icons are `aria-hidden`** — any Lucide icon sitting next to visible text
  (buttons, title bars, list rows) is hidden so screen readers announce the label once,
  not the icon too. This is every inline icon in the app.
- **Toggles expose state** — segmented controls and on/off buttons carry `aria-pressed`
  (Settings, Token Lab, the sidebar rail, the graph legend); the shared-toggle in
  `ToolInfoSheet` is a `role="switch"` with `aria-checked`. Tabs that *navigate*
  (`AdminTabs`) use `aria-current="page"` instead — pressed is for state, current is for
  location.
- **Live regions, two politeness levels** — loading states announce politely
  (`role="status"` on the shared `WidgetLoading` spinner); the backend-down banner
  interrupts (`role="alert"` in `BackendStatusBanner`).
- **Meaningful SVGs are `role="img"`** — brand marks and loading illustrations
  (Wordmark, ThinkingGlyph, BigsailLoading, graph/diagram canvases) get `role="img"`
  plus a label; purely decorative ones are hidden like any other icon.
- **Motion and touch floors** — every keyframe has a `prefers-reduced-motion: reduce`
  fallback (see Motion below), and `IconButton` guarantees the 44px touch target on
  mobile regardless of icon size.

## Motion

No animation framework — pure CSS keyframes centralized in `index.css`
(`tiles-skeleton-sweep`/`-in`, `kg-node-in`, `drip-row-in`, `starter-pill-in`,
`aether-border-cycle`, …). Staggered entrances share one convention: an inline `--i` custom
property set per element (`style={{ "--i": index }}`), consumed by
`animation-delay: calc(var(--i, 0) * Xms)` in the CSS class. Every keyframe has a
`prefers-reduced-motion: reduce` fallback.

## Schema versioning (persisted widget state)

Persisted widget state (graph, widgets, tiles layout) carries a `schemaVersion` stamp
([`frontend/src/lib/schemaVersion.ts`](../frontend/src/lib/schemaVersion.ts)). A version mismatch
on load is treated as "stale, re-stamp" — never as "wipe and discard." Additive field changes don't
require a version bump; only breaking shape changes do. This is what lets the frontend evolve a
widget's saved shape without ever nuking a user's existing session state.

---

## Gotchas

- **New color → both theme blocks.** Adding a token means editing `@theme`, `:root`, *and* `.dark`
  in `index.css` — miss one and the color silently falls back to `unset`/transparent in whichever
  mode you skipped.
- **Don't hand-roll widget chrome.** If a new Bigsail widget type needs its own drag handle,
  flip, or skeleton, something's wrong — those come from `CardShell` for free. Implement the
  `Spec*` content renderer only.
- **Admin pages are URL-driven, not state-driven.** A new admin page needs an `AdminPageId` /
  `ADMIN_PATHS` entry in `useRoute.ts` *and* a tab in `AdminTabs` — the route and the nav are two
  separate registrations that both have to exist for a page to be reachable.
- **`/style-guide` ships to prod** (unlike `/screenshots`, which is dev-only) — it's meant to be a
  live, shareable artifact, not a dev tool. Keep it cheap: it should only ever read tokens/
  primitives that already exist, never fetch data or hold its own state.
