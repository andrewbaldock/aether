# Aether Design System Audit

Read-only evidence audit of `~/Code/aether` for the Ashby Design Engineer application. Every finding below was verified against source in this repo — no aspirational claims. Format: What / Receipt / Why it matters / Confidence.

---

## 1. Design Tokens / Theming

### Central token source of truth
- What: Tailwind v4 `@theme` block registers semantic tokens (`--color-surface`, `--color-content`, `--color-accent`, `--color-neon-pink/cyan`, `--font-display`, etc.) that resolve to CSS custom properties, flipped between `:root` (light) and `.dark` (dark) blocks.
- Receipt: `frontend/src/index.css:15-88` (`@theme` at 19-41, light values 44-64, dark values 68-88)
- Why it's design-system-worthy: One indirection layer (`@theme` → `var(--x)` → `:root`/`.dark` value) means every utility class stays stable while only the underlying value flips — textbook token architecture.
- Confidence: solid

### Components consume tokens, not hardcoded values
- What: Sampled 5+ components (Sidebar, ConfirmDialog, StarterPrompts, ChartWidget, WidgetEmptyState) — all use semantic classes (`bg-surface-raised`, `text-content-muted`, `border-border-strong`) rather than raw hex/px.
- Receipt: `frontend/src/shell/Sidebar.tsx:62`, `frontend/src/shell/ConfirmDialog.tsx:35-48`, `frontend/src/capabilities/widgets/Chart/ChartWidget.tsx:3-7`
- Why it's design-system-worthy: Consumption discipline, not just token definition, is what makes a token system real.
- Confidence: solid (minor exception: a couple of hardcoded brand gradient stops like `from-[#fd40a4]` in StarterPrompts/ChatPanel — not exposed as tokens)

### Light/dark theming
- What: `.dark` class toggle wired through a `useTheme` hook, persisted to localStorage, plus a pre-paint inline script in `index.html` that applies the class before React mounts (no flash-of-wrong-theme).
- Receipt: `frontend/src/theme/useTheme.tsx:25-67`, `frontend/src/theme/ThemeToggle.tsx:6-22`, pre-paint script in `frontend/index.html`
- Why it's design-system-worthy: Full loop — OS-preference fallback, explicit override, persistence, and zero-flash boot — is a production-grade theming implementation, not a toy toggle.
- Confidence: solid

### Typography scale
- What: A 4-step user-adjustable text-size scale (`xs:14 / sm:15 / md:16 / lg:18`) plus a font-face stack (system/Geist/Georgia/Lora), applied via root `font-size`.
- Receipt: `frontend/src/theme/useAppearance.tsx:25-53`
- Why it's design-system-worthy: Type scale is a deliberate, user-facing, token-driven setting — not just CSS defaults.
- Confidence: solid

### Spacing scale
- What: No custom spacing token file exists. Components consistently use Tailwind's default 4px-based spacing utilities (`px-4`, `gap-1`, `p-5`), which happens to produce visual consistency, but it's inherited from the framework default, not an authored design decision.
- Receipt: n/a (absence) — sampled usage in `Sidebar.tsx:62`, `ChatPanel.tsx`, `ConfirmDialog.tsx:35`
- Why it's design-system-worthy: N/A — this is the one soft spot in an otherwise strong tokens story.
- Confidence: thin

---

## 2. Widget System

### Widget type inventory
- What: Five widget types — table, chart, timeline, images, knowledge-graph — each with its own component folder and a shared TypeScript contract.
- Receipt: `shared/contract/plan.ts:8-13` (`Capability` union), `shared/contract/widgets.ts:14-127`, folders under `frontend/src/capabilities/widgets/{Chart,Table,Timeline,Images,KnowledgeGraph}/`
- Why it's design-system-worthy: A closed, typed set of widget kinds backed by a shared FE↔BE contract is exactly the kind of system a design-system interview probes for.
- Confidence: solid

### Common widget shell
- What: `CardShell` is the single wrapper every Bigsail card renders through — drag handle, title header, skeleton entrance animation, flip mechanism, settings/hide/duplicate actions. Individual widgets (`BigsailCard`) are a dumb dispatcher that only renders type-specific content inside this shell.
- Receipt: `frontend/src/capabilities/widgets/Bigsail/TilesCanvas.tsx:250-403` (CardShell), `frontend/src/capabilities/widgets/Bigsail/cards.ts:41-57` (Card interface)
- Why it's design-system-worthy: A shared shell that's agnostic to widget type — so a new widget type only has to implement its content, not its chrome — is the core "system" claim. This is real, not aspirational.
- Confidence: solid

### Flip-to-reveal (JSON + prompt)
- What: 3D CSS flip (`perspective` + `rotateY(180deg)` + `backface-visibility: hidden`) implemented exactly once inside `CardShell`. The back face (`CardBack`) shows an editable summary, a Regenerate button, and the raw JSON spec via `JSON.stringify`.
- Receipt: `frontend/src/capabilities/widgets/Bigsail/TilesCanvas.tsx:294-399`, `frontend/src/capabilities/widgets/Bigsail/CardBack.tsx:17-89`
- Why it's design-system-worthy: This is the signature feature and it checks out exactly as claimed — one implementation, shared by all 5 widget types, zero duplication.
- Confidence: solid

### Skeleton loaders per widget type
- What: A distinct skeleton "silhouette" per widget type (bar shapes for chart, header+rows for table, dots+lines for timeline, scattered blobs for knowledge-graph, grid blocks for images), all driven by ONE shared shimmer keyframe and ONE shared entrance-cascade keyframe.
- Receipt: `frontend/src/capabilities/widgets/Bigsail/SkeletonCard.tsx` (per-type `SILHOUETTE` map), `frontend/src/index.css` (`tiles-skeleton-sweep`, `tiles-skeleton-in` keyframes)
- Why it's design-system-worthy: Per-type visual hinting + a single unified motion language (not per-component reinvented animation) is a nuanced, correct claim — worth stating precisely this way in the interview.
- Confidence: solid

### Drag/resize grid (Bigsail)
- What: GridStack (v12.6.0) owns the entire grid — item DOM, drag, resize, compaction. React only renders content into GridStack-created wrappers via portals. No widget component contains any GridStack-aware code.
- Receipt: `frontend/src/capabilities/widgets/Bigsail/TilesCanvas.tsx:98-129` (GridStack.init), verified zero GridStack references inside Chart/Table/Timeline components
- Why it's design-system-worthy: Drag/resize-for-free is a real architectural property, not a per-widget reimplementation — confirms the "every widget inherits this" claim.
- Confidence: solid

---

## 3. Interaction & State Patterns

### URL-bound state / deep linking
- What: A custom router (no external routing library) supports four URL shapes — `/`, `/:view`, `/c/:id`, `/c/:id/:view` — where `:view` is a human-readable slug mapped to a capability (e.g. `/c/abc123/chart`). Every conversation and every open tool tab is a shareable, cold-loadable URL.
- Receipt: `frontend/src/hooks/useRoute.ts:1-85` (Route type, slug mapping, `viewPath`)
- Why it's design-system-worthy: Deep-linkable widget state (not just page state) is a meaningfully deeper URL-state story than most apps bother with.
- Confidence: solid (search params are NOT used for state — widget config lives in persisted `ui_state`, not the URL; worth being precise about this distinction)

### Nav shrinks to icons
- What: The capability toolbar is a CSS `@container`, so icon-only collapse responds to the toolbar's own width, not just viewport width — combined with a `max-md:` viewport breakpoint for mobile tap-target sizing (44×44px).
- Receipt: `frontend/src/shell/CapabilityColumn.tsx:82-88` (`@container`), `:216-268` (collapse logic, dual breakpoints `max-md:hidden @max-[640px]:hidden`)
- Why it's design-system-worthy: Container queries (not just viewport media queries) for a nav-collapse pattern is a more sophisticated responsive technique than most codebases use.
- Confidence: solid

### Shared layout across help/settings/admin
- What: `AdminPage` is a shared chrome wrapper (scroll container, max-width, padding, tab-bar slot, heading) used identically by Settings, Welcome, and Health pages, plus a shared `AdminTabs` nav component. The code comment explicitly documents this as a deliberate refactor to stop the column "jumping" between admin pages.
- Receipt: `frontend/src/shell/AdminPage.tsx:1-49` (with the explanatory comment at lines 4-13), usage at `SettingsWidget.tsx:16`, `WelcomeWidget.tsx:14`, `HealthWidget.tsx:36-37`
- Why it's design-system-worthy: This is a rare case where the codebase itself narrates the design-system motivation — good direct quote material for a cover letter.
- Confidence: solid

### Systematic responsive breakpoints
- What: A single `useIsMobile()` hook (768px threshold, via `useSyncExternalStore`) is the one source of truth for JS-level mobile branching; CSS responsiveness consistently uses Tailwind's standard breakpoints plus one custom variant (`short:` for landscape phones under 430px height).
- Receipt: `frontend/src/shell/useIsMobile.ts`, `frontend/src/index.css:1-14` (`@custom-variant short`), branch point at `frontend/src/shell/Shell.tsx:152`
- Why it's design-system-worthy: Verified across 10+ components with no ad hoc per-component breakpoint overrides — genuinely systematic, not just "mostly consistent."
- Confidence: solid

---

## 4. Bonus System-Thinking Evidence

### Reusable primitives
- What: Radix UI (Tooltip, AlertDialog, Dialog, Select/Dropdown) as the accessible foundation, wrapped by ~12 custom shell components (Tooltip, ConfirmDialog, EditWidgetDialog, ModelPicker, AdminTabs, StarterPrompts, etc.), plus 52 widget-specific components. No component library (shadcn/Chakra) — pure Radix + Tailwind.
- Receipt: `frontend/src/shell/Tooltip.tsx:33-72`, `frontend/src/shell/ConfirmDialog.tsx:13-71`, `frontend/package.json` (`@radix-ui/react-*` deps)
- Why it's design-system-worthy: Choosing headless-primitives-plus-custom-wrapper over a full component library is a legitimate, defensible architectural choice to discuss.
- Confidence: solid

### Composition patterns
- What: Radix's `asChild` polymorphic pattern is used correctly and documented in code comments (merges trigger props onto the caller's own element so layout classes keep working). Deeper compound-component APIs (a branded `<Tabs.List><Tabs.Tab>`-style API) are NOT present — `AdminTabs` is a plain `.map()` loop, not a compound component.
- Receipt: `frontend/src/shell/Tooltip.tsx:42-48` (`asChild` + explanatory comment), `frontend/src/shell/AdminTabs.tsx:36-50` (plain loop, not compound)
- Why it's design-system-worthy: Real, but modest — accurate framing is "uses established composition patterns correctly," not "built a compound-component API."
- Confidence: partial

### Accessibility
- What: 136+ instances of `aria-*`/`role=` attributes found; icon buttons carry `aria-label`, decorative icons are `aria-hidden`, Radix owns focus-trap/Escape/outside-click for all dialogs and popovers, and custom keyboard handling exists where needed (Enter-to-submit in chat, Enter/Space activation in the force-graph).
- Receipt: `frontend/src/shell/ChatPanel.tsx:501-506` (keyboard handling), `frontend/src/shell/AdminTabs.tsx:60` (`aria-current`), `frontend/src/capabilities/widgets/KnowledgeGraph/ForceGraph.tsx` (comment: "Radix owns outside-click / Escape / focus-trap / collision-flipping")
- Why it's design-system-worthy: Systematic, not sprinkled — and the codebase explicitly delegates the hard a11y primitives to Radix rather than reinventing them, which is the correct call.
- Confidence: solid

### Animation / motion system
- What: No animation framework (no framer-motion) — pure CSS keyframes centralized in `index.css`, with a consistent stagger pattern (`animation-delay: calc(var(--i, 0) * Xms)`) reused across tiles, table rows, and starter pills, and `prefers-reduced-motion` handling on every major keyframe.
- Receipt: `frontend/src/index.css` — `tiles-skeleton-sweep`/`tiles-skeleton-in`, `kg-node-in`, `drip-row-in`, `starter-pill-in`, `aether-border-cycle`, plus `@media (prefers-reduced-motion: reduce)` blocks
- Why it's design-system-worthy: A unified motion language (shared easing/duration/stagger tokens, not per-component magic numbers) plus a11y-aware motion is a strong, precise claim.
- Confidence: solid

### Schema versioning ("heal on load")
- What: Persisted widget state (graph, widgets, tiles layout) carries a `schemaVersion` stamp. On load, a version mismatch is treated as "stale, re-stamp" — never as "wipe and discard." Additive field changes don't require a version bump; only breaking shape changes do.
- Receipt: `frontend/src/lib/schemaVersion.ts:1-71` (`SCHEMA_VERSIONS`, `stamp`, `validate`)
- Why it's design-system-worthy: An opinionated, explicitly-documented policy for how the system evolves without breaking or destroying user data — genuinely clever and worth a specific mention.
- Confidence: solid

### Skeleton drip-feed via composition plan
- What: The backend planner announces which capabilities a turn will produce before any tool executes; the frontend immediately paints skeleton cards in their final grid positions and swaps each one for the real card in place as it arrives — no empty-spinner wait, no layout jump.
- Receipt: `frontend/src/capabilities/widgets/Bigsail/skeletonCards.ts` (comment at top explains the rationale), `frontend/src/capabilities/widgets/Bigsail/plan.ts`
- Why it's design-system-worthy: This is a genuinely non-obvious perceived-performance technique, tightly coupled to the widget-shell/skeleton system above — good "systems thinking" story.
- Confidence: solid

### Clarifying pre-pass
- What: When the planner is unsure of user intent, it emits a `clarify` event (a question + tappable option chips) instead of guessing and composing a wrong turn. Selecting an option sends a follow-up flagged `clarified` so the planner won't loop.
- Receipt: `frontend/src/shell/AgentEventContext.tsx` (`clarify` event type), `frontend/src/shell/ChatPanel.tsx:32-65` (`clarifyOptions`, `clarified` flag)
- Why it's design-system-worthy: Less a "design system" component and more a product-thinking signal, but worth a brief mention for a design-engineer hybrid role.
- Confidence: solid

---

## GAPS / DON'T CLAIM

- **No authored spacing scale.** Spacing consistency comes from Tailwind's default 4px grid, not a deliberate, documented token set. Don't say "designed a spacing scale" — say "typography and color are tokenized; spacing follows a consistent 4px rhythm via Tailwind defaults."
- **No compound-component API.** `asChild` is used correctly, but there's no custom `<Tabs.List><Tabs.Tab>`-style composition system. Don't claim "built a compound component library" — the composition story is "uses Radix's primitive + asChild pattern correctly," which is accurate but more modest.
- **URL state is page/view-level, not full app state.** Search params are not used — widget configuration lives in a persisted `ui_state` blob, not the URL. Don't say "the entire app state is in the URL" — say "every conversation and tool view is deep-linkable."
- **"Multi-theme" is really just light/dark.** There's no third theme or brand-switchable theming beyond the two-mode toggle. Don't say "multi-theme system" — say "light/dark theming with OS-preference fallback and zero-flash boot."
- **No component library / Storybook / published primitives.** The ~12 shell primitives are consistently applied in-app but aren't packaged, documented, or browsable as a standalone design-system artifact. If asked "can I see your design system," there's currently no single page that shows it off — see the recommendations below.

---

## 2026-08 ADDITIONS

Same evidence discipline as above: every claim below was verified by running it, not by writing it.

### Browsable Storybook (P1 — done)
- What: Storybook 10 (`@storybook/react-vite`) in `frontend/`, sharing the app's real `vite.config.ts` and importing `src/index.css` — so a story renders through the same React + Tailwind v4 pipeline as the app, against the live `@theme` tokens. A theme toolbar (`withThemeByClassName`) flips the same `.dark` class `useTheme` flips, so every story previews in both themes. 16 entries: 2 MDX docs pages + 14 stories across Tooltip, IconButton, ConfirmDialog, StarterPrompts, CardShell, SkeletonCard, and the chart palette. Prop tables are generated from the TS types; `@storybook/addon-a11y` runs axe per story.
- Receipt: `frontend/.storybook/{main.ts,preview.tsx}`, `frontend/.storybook/docs/{Introduction.mdx,DesignTokens.mdx}`, `*.stories.tsx` beside each component. Verified: `bun run build-storybook` succeeds; all 18 story renders (9 stories × 2 themes) load with **zero console errors**.
- Why it's design-system-worthy: This is the artifact that was missing — "can I see your design system" now has an answer that isn't a screenshot.
- Confidence: solid
- **Not yet true:** not deployed to a public URL. Say "a browsable Storybook" — **not** "a published design system" — until it's hosted.

### Data-viz token ramp (partially closes the "stray hex" gap)
- What: Chart series colours were 12 hardcoded hex values in `ChartWidget.tsx` (two of them copy-pasted duplicates of the `--neon-pink`/`--neon-cyan` token values) plus a runtime HSL generator for pie slices. Replaced with an eight-slot categorical ramp, `--viz-1..8`, defined per theme in `index.css` and consumed as `var(--viz-N)`. Recharts writes those straight into SVG `fill`/`stroke`, so charts re-colour on a theme flip with no JS and no re-render.
- Receipt: `frontend/src/index.css` (`--viz-1..8` under `:root` and `.dark`), `frontend/src/capabilities/widgets/Chart/ChartWidget.tsx:48-71` (`paletteColor`/`seriesColor`), `frontend/src/capabilities/widgets/StyleGuide/parseTokens.ts` (`VIZ_RAMP`).
- Measured, not asserted: the **old** palette FAILED validation in both modes (worst adjacent CVD ΔE 5.5 under deuteranopia, against a ≥ 8 target; 10 of 12 colours below 3:1 contrast on the light surface; 5 outside the lightness band). The **new** ramp passes every hard gate in both modes on Aether's real surfaces — worst adjacent CVD ΔE 9.1 light / 8.4 dark, worst normal-vision ΔE 19.6 / 19.3.
- Why it's design-system-worthy: This is the strongest single story in the set, because it's *measured*. It also demonstrates the token architecture flexing into a domain (SVG attributes in a third-party charting library) that utility classes can't reach.
- Confidence: solid
- **Honest caveat:** the ramp's hues and steps are adopted from a validated reference palette, not hand-derived. The design work was diagnosing the failure, choosing a token architecture that survives a theme flip, deciding the ramp must exclude the brand accent (`--accent` means "clickable"), and wiring the validation into the docs. Don't claim to have derived the colour science.

### Tailwind v4 tree-shaking trap (worth knowing, worth telling)
- What: The ramp is deliberately **not** registered in the `@theme` block. Tailwind v4 drops `@theme` entries that no utility class references, so `--color-viz-1` resolved to the *empty string* at runtime — charts rendered with no stroke and **no error**. Caught by screenshotting the story, not by the type checker or the linter.
- Receipt: `frontend/src/index.css` (the note where the `@theme` registration would go), regression test in `parseTokens.test.ts` ("keeps the viz ramp out of @theme").
- Why it's design-system-worthy: A concrete, non-obvious framework failure mode, found by looking at the rendered output — and then fenced with a test so it can't come back. Good interview answer to "tell me about a bug that didn't throw."
- Confidence: solid

### Chart marks now follow the identity/action split
- What: Two anti-patterns removed. (1) Recharts painted legend *labels* in their series colour — identity encoded twice, and unreadable body text at slot 4 on white; labels now wear `text-content-muted` and the swatch carries the colour. (2) Single-series bar charts coloured every bar differently, re-encoding a value that bar length already shows; they now use slot 1 uniformly.
- Receipt: `frontend/src/capabilities/widgets/Chart/ChartWidget.tsx` (`LEGEND_PROPS`, and the removed per-`Cell` fill in the bar branch).
- Confidence: solid

### Still not true (the gaps above that remain open)
- **No authored spacing scale.** Unchanged — the `GAPS` entry above still stands verbatim.
- **No third theme.** Still light/dark only.
- **No compound-component API.** `AdminTabs` is still a `.map()`, and it's coupled to the router — which is why it has no story yet.
- **Brand gradient hex remains.** `from-[#fd40a4]` in `StarterPrompts`/`ChatPanel` is still raw; only the *chart* palette was tokenized.
- **No visual-regression suite.** The a11y addon runs axe per story; there is no snapshot diffing (no Chromatic).
