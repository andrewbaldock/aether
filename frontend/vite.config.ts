import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    allowedHosts: ["aether-dev"],
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
