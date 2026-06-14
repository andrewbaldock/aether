import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Service worker auto-updates in the background and takes over on the
      // next load — no "new version available" prompt to maintain. Fits a
      // low-churn demo: visitors always end up on the latest deploy.
      registerType: "autoUpdate",
      // favicon SVGs are referenced from index.html at runtime, so precache
      // them alongside the built assets.
      includeAssets: ["favicon.svg", "favicon-light.svg", "apple-touch-icon.png"],
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
  server: {
    port: 5174,
    allowedHosts: ["aether-dev"],
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
