import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local dev API port. The API runs on 3001 (3000 is commonly taken locally).
// Override with VITE_API_PORT when needed.
const API_PORT = process.env.VITE_API_PORT ?? "3001";

export default defineConfig({
  plugins: [react()],
  // widthTier=office: 1440px non-responsive (DECISION #8)
  // No PWA plugin here — PWA is POS only.
  server: {
    // Same-origin proxy so the AuthProvider's empty baseUrl reaches the API
    // without CORS. This MUST list every API @Controller root the admin fetches
    // — anything missing falls through to the SPA index.html, so the client's
    // response.json() chokes on "<!DOCTYPE html>". Keep in sync when adding a
    // backend module. (Devices live under /platform/devices, not /devices.)
    proxy: Object.fromEntries(
      [
        "/auth",
        "/branches",
        "/sales",
        "/audit",
        "/health",
        "/master-data",
        "/import",
        "/inventory",
        "/users",
        "/platform",
      ].map((p) => [p, { target: `http://localhost:${API_PORT}`, changeOrigin: true }]),
    ),
  },
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
