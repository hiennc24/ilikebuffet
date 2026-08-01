import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Local dev API port. The API runs on 3001 by default.
// Override with VITE_API_PORT when needed.
const API_PORT = process.env.VITE_API_PORT ?? "3001";

export default defineConfig({
  server: {
    proxy: Object.fromEntries(
      ["/auth", "/branches", "/sales", "/health", "/devices"].map((p) => [
        p,
        { target: `http://localhost:${API_PORT}`, changeOrigin: true },
      ]),
    ),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // App-shell precache strategy: cache the shell HTML + assets on install.
      // Full offline data sync is deferred to P8.
      injectRegister: "auto",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // App-shell: serve index.html for all navigation requests (SPA mode).
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: "ilikebuffet POS",
        short_name: "IBB POS",
        description: "Hệ thống bán hàng ilikebuffet",
        theme_color: "#235B54",
        background_color: "#FAF8F6",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  // widthTier=ops: ≥768px responsive (DECISION #8)
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
  },
});
