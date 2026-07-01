# Design System

The tokens, primitives, and shared shells the frontend is built from. This is the single place
that story lives; architecture is [ARCHITECTURE.md](./ARCHITECTURE.md), the dependency rationale
is [STACK.md](./STACK.md), mobile/responsive specifics are [MOBILE.md](./MOBILE.md).

**See it live, not just described:** the `/style-guide` admin page (Style Guide tab, next to
Settings/Health) renders every color token, the type scale, the spacing rhythm, a couple of
primitives, and the five Bigsail widget skeletons — pulled from the running app, not a mockup.
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
- **Spacing:** no separate spacing token file — components use Tailwind's default 4px-based scale
  (`px-4`, `gap-1`, …) directly. Consistent in practice; not a bespoke token set.

> **Rule of thumb:** a new color needs an entry in both the `@theme` block and both `:root`/`.dark`
> value blocks. Never reach for a raw hex in a component — if the token you need doesn't exist,
> add it here first.

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
