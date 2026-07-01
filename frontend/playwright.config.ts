import { defineConfig } from "@playwright/test";
import { VIEWPORTS } from "./e2e/devices";

// E2E layer for the frontend. The whole strategy is self-contained: every `/api/*`
// call is mocked at the network layer (see e2e/fixtures/mockApi.ts), so no backend
// process, no LLM tokens, fully deterministic — fits the light-budget demo and lets
// CI run with no secrets.
//
// webServer builds the app and serves it with `vite preview` on 5174 so Playwright
// boots the real production bundle itself. We use `build:app` (not `build`) so the
// preview build does NOT re-run the vitest suite — unit tests are a separate CI job.
// Point the suite at an already-running server with E2E_BASE_URL (e.g. a preview
// build on another port) to skip the managed webServer — handy for validating the
// production bundle locally without disturbing the dev server on 5174.
const EXTERNAL_BASE = process.env.E2E_BASE_URL;
const BASE_URL = EXTERNAL_BASE ?? "http://localhost:5174";

export default defineConfig({
  testDir: "./e2e",
  // Only *.spec.ts are tests; screenshots.ts / devices.ts / fixtures are helpers.
  testMatch: /.*\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // CI gets 2 retries; local gets 1. The mock is deterministic, so a retry never
  // hides a real bug — it only absorbs the occasional load flake when ~60 tests
  // (WebKit + Chromium) hammer one server at once, especially in dev-server mode
  // (E2E_BASE_URL) where Vite serves+compiles live. A genuinely broken test still
  // fails on every attempt.
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? "html" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  // When E2E_BASE_URL is set we assume the caller already started a server there.
  webServer: EXTERNAL_BASE
    ? undefined
    : {
        // VITE_E2E=1 drops the /api proxy and disables the PWA service worker (see
        // vite.config.ts), so the network mock is the only thing answering /api.
        command:
          "bun run build:app && bun run preview --port 5174 --strictPort",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { VITE_E2E: "1" },
      },
  // Seven projects: desktop + (iPhone, iPad, Pixel) × (portrait, landscape).
  // Names and device descriptors come from the shared matrix in e2e/devices.ts.
  projects: VIEWPORTS.map((v) => ({ name: v.name, use: v.use })),
});
