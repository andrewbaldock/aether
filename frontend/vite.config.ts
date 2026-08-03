import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Under E2E (Playwright sets VITE_E2E=1 on its webServer) we point /api at nothing:
// every /api call MUST be answered by the network mock (e2e/fixtures/mockApi.ts).
// With a real proxy target, any request that races ahead of the mock falls through
// to a backend and comes back 502, which the smoke test (no console errors allowed)
// treats as a hard failure. No proxy → an escaped call is a clean, mock-owned net
// error instead of a real 502.
const isE2E = process.env.VITE_E2E === "1";

// Storybook reuses this same config (see .storybook/main.ts) so stories render
// through the real React + Tailwind v4 pipeline. A component docs site has no
// business registering the app's service worker, so the PWA plugin sits out.
// Truthy, not === "1": the scripts export STORYBOOK=1, but Storybook's own CLI
// overwrites the variable with "true" before it loads this file.
const isStorybook = !!process.env.STORYBOOK;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // No service worker under E2E: the SW runs in its own context and can fetch
      // /api outside Playwright's page.route mock, racing the mock on first load and
      // leaking a request to the (proxy-less) network. Disabling it makes the mock
      // the sole answerer of /api, which is the whole point of the deterministic suite.
      disable: isE2E || isStorybook,
      // Service worker auto-updates in the background and takes over on the
      // next load — no "new version available" prompt to maintain. Fits a
      // low-churn demo: visitors always end up on the latest deploy.
      registerType: "autoUpdate",
      // favicon SVGs are referenced from index.html at runtime, so precache
      // them alongside the built assets.
      includeAssets: [
        "favicon.svg",
        "favicon-light.svg",
        "apple-touch-icon.png",
      ],
      manifest: {
        name: "Aether — Ask Anything",
        short_name: "Aether",
        description:
          "Aether — a conversational AI explorer that answers in 3D scenes, graphs, and charts.",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        // Pink brand on the near-black app shell; theme_color tints the OS
        // status bar / title bar in the installed app.
        theme_color: "#110d1a",
        background_color: "#110d1a",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // The SPA falls back to index.html for client-side routes, but never
        // for /api/* — those must always hit the network.
        navigateFallbackDenylist: [/^\/api\//],
        // Bump the precache cap so the larger JS chunks (recharts, d3, etc.)
        // are covered; default is 2 MiB.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        // Keep the SW disabled in `vite dev` — avoids stale-cache surprises
        // while iterating. Use `vite preview` to exercise the real SW.
        enabled: false,
      },
    }),
  ],
  resolve: {
    // `@contract/*` → the shared FE↔BE wire-contract module (see shared/contract/).
    // Matches the `paths` entry in tsconfig.app.json; covers dev/build/preview/vitest
    // (all read this config). Backend resolves the same path via its own tsconfig.
    alias: {
      "@contract": fileURLToPath(
        new URL("../shared/contract", import.meta.url)
      ),
    },
  },
  server: {
    port: 5174,
    allowedHosts: ["aether-dev"],
    // No /api proxy under E2E — the network mock owns every /api call. See isE2E note.
    proxy: isE2E ? undefined : { "/api": "http://localhost:8000" },
  },
  preview: {
    // `vite preview` (what Playwright boots) doesn't inherit server.proxy in every
    // Vite version, so set it here too — and likewise drop it under E2E.
    proxy: isE2E ? undefined : { "/api": "http://localhost:8000" },
  },
});
