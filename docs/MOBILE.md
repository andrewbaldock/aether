# Mobile & PWA

How Aether behaves on phones and tablets, and how it works as an installable Progressive Web App.
This is the single place the mobile story lives; operational commands are in
[RUNBOOK.md](./RUNBOOK.md#pwa--service-worker), the dependency rationale is in
[STACK.md](./STACK.md).

---

## The short version

- Aether is **responsive** — one shell that reflows below a 768px breakpoint, not a separate
  mobile site.
- Aether is an **installable PWA** — Add to Home Screen on iOS Safari / the install prompt on
  Chrome gives a standalone, app-like launch (no browser chrome).
- Mobile Safari (iPhone/iPad) is the **regression-prone surface**, so it's the one the E2E matrix
  exercises hardest (on WebKit).

---

## Responsive layout

The shell is a three-zone desktop layout (sidebar / chat / capability column). On mobile it
collapses to a single column.

- **The breakpoint is 768px** (Tailwind's `md`), defined once in
  [`src/shell/useIsMobile.ts`](../frontend/src/shell/useIsMobile.ts). Everything that needs to
  branch on "mobile vs. not" reads `useIsMobile()` so there is **one** threshold, not a scatter of
  magic numbers.
- `useIsMobile` is a `matchMedia(`(max-width: 767px)`)` hook wired through `useSyncExternalStore`,
  so it re-renders on resize / device rotation without resize-event spam.
- **iPad counts as desktop** (≥768px in portrait), which is deliberate — the three-zone layout
  fits a tablet. Phones in landscape can cross the breakpoint; that's expected.
- Tailwind responsive prefixes (`sm:`/`md:`/`lg:`) handle the finer reflow inside components.

> **Rule of thumb:** if you need new responsive behavior, gate it on `useIsMobile()` or a Tailwind
> `md:` prefix — don't introduce a second breakpoint value.

---

## PWA / installability

Wired via **`vite-plugin-pwa`** (config in [`frontend/vite.config.ts`](../frontend/vite.config.ts)).

**What you get:**
- A **web manifest** (`dist/manifest.webmanifest`) — name, icons, `display: standalone`, brand
  colors — so the app can be installed and launches without browser chrome.
- A **Workbox service worker** (`dist/sw.js`) that precaches the built assets, so the app shell
  loads instantly on repeat visits and survives a flaky connection. `/api/*` is **excluded** from
  the cache (`navigateFallbackDenylist`) so data always comes from the network.
- **`autoUpdate`** registration — the SW refreshes silently in the background and takes over on
  the next load. No update-prompt UI to build or maintain; visitors converge on the latest deploy
  after one extra reload.

**The SW is off in `vite dev`** (to avoid stale-cache confusion while iterating) and **on in
`preview`/prod**. To test it locally:

```bash
cd ~/Code/aether/frontend
bun run build:app
bunx vite preview        # serves dist/ with the service worker active
```

### Icons & theming

Icon assets live in [`frontend/public/`](../frontend/public/):

| File | Purpose |
|------|---------|
| `icon-source.svg` | Build source — 512px, the dark favicon glyph with safe-area padding. Edit this, then regenerate. |
| `pwa-192x192.png`, `pwa-512x512.png` | Standard icons (`purpose: any`). |
| `maskable-512x512.png` | Maskable icon — Android adaptive icon masks crop to a safe circle/squircle, hence the padding. |
| `apple-touch-icon.png` (180px) | iOS home-screen icon. |

Regenerate from the SVG with macOS `sips` (no extra tooling) — see the exact commands in
[RUNBOOK.md → PWA / Service Worker](./RUNBOOK.md#pwa--service-worker).

The manifest `theme_color`/`background_color` are `#110d1a` (the near-black brand shell). That's
mirrored in `index.html` by the `theme-color` meta tag and the iOS `apple-mobile-web-app-*` tags,
so the OS status bar / title bar in the installed app matches the app shell.

---

## How it's tested

Mobile is a first-class part of the E2E suite, not an afterthought.

- **A 7-project device matrix** ([`frontend/e2e/devices.ts`](../frontend/e2e/devices.ts)): desktop
  + (iPhone 15, iPad gen 7, Pixel 7) × (portrait, landscape).
- **Engine split mirrors the real risk:** iPhone/iPad presets run on **WebKit** (Safari — the
  surface that actually regresses), Android (Pixel) on **Chromium**.
- Mobile-specific specs cover the layout collapse and the sidebar behavior
  (`e2e/mobile-layout.spec.ts`, `e2e/sidebar.spec.ts`), gated on viewport width so iPad/landscape
  phones get the desktop assertions.
- The same matrix + mock backend power the dev-only `/screenshots` contact sheet
  (`bun run screenshots`), so you can eyeball every viewport at once.

Run them with `bun run test:e2e` (see [RUNBOOK.md](./RUNBOOK.md#test)). Note these mock `/api` at
the network layer — no backend or tokens needed.

> **The service worker is NOT exercised by the E2E suite** — Playwright drives the dev/preview
> server and the SW behavior (install, offline, update) is best verified by hand on a real device
> after a deploy that touches the manifest or icons.

---

## Gotchas

- **SW off in dev, on in preview/prod** — if a change "isn't taking" in a preview/prod tab, it may
  be the old cached shell. One reload usually clears it (`autoUpdate`); a hard-stuck version clears
  via DevTools → Application → Service Workers → Unregister.
- **One breakpoint, one place** — change the mobile threshold only in `useIsMobile.ts`; don't
  hardcode 768 elsewhere.
- **Maskable padding matters** — if you redraw the icon, keep the glyph inside the safe area or
  Android will crop it. Test the maskable rendering (Chrome DevTools → Application → Manifest has a
  maskable preview).
- **iOS install is manual** — there's no automatic install prompt on iOS Safari; it's Share → Add
  to Home Screen. Chrome/Android shows a prompt.
