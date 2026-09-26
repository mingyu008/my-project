/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Must match the origin allowed by Spring CORS (app.cors.allowed-origins).
    port: 3000,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
    // Playwright specs in e2e/ are run by "npm run e2e", not Vitest.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
