import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // Without this, vitest stubs ALL .css imports to empty strings — including
    // index.css?raw, which StyleGuide/parseTokens.ts parses for the token list.
    // css: true makes ?raw return the real file source, same as Vite proper.
    css: true,
    // e2e/ holds Playwright specs (their own runner + `test` import); vitest must
    // not try to load them — it would fail importing @playwright/test out of
    // context. Keep the two test layers cleanly separated.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
});
