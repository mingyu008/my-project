/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Test-mode sign-in screens (src/auth/authMode.ts). One AUTH_TEST_MODE variable drives both this and the
  // backend (app.auth.test-mode). Default: on for "npm run dev" (like the backend's local profile), off otherwise.
  const env = loadEnv(mode, ".", ["VITE_", "AUTH_"]);
  const authTestMode = env.VITE_AUTH_TEST_MODE ?? env.AUTH_TEST_MODE ?? (mode === "development" ? "true" : "false");

  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_AUTH_TEST_MODE": JSON.stringify(authTestMode),
    },
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
  };
});
