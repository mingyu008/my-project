/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

interface ProxyEvents {
  on(event: "proxyReq", listener: (proxyReq: { removeHeader(name: string): void }) => void): void;
}

export default defineConfig(({ mode }) => {
  // "npm run dev:mobile": dev server open to the LAN (phones on the same Wi-Fi). The app calls /api on its own
  // origin and the proxy below forwards it to Spring, so the phone never needs to reach localhost:8080.
  const mobile = mode === "mobile";

  // Test-mode sign-in screens (src/auth/authMode.ts). One AUTH_TEST_MODE variable drives both this and the
  // backend (app.auth.test-mode). Default: on for the dev server (like the backend's local profile), off otherwise.
  const env = loadEnv(mode, ".", ["VITE_", "AUTH_"]);
  const devServer = mode === "development" || mobile;
  const authTestMode = env.VITE_AUTH_TEST_MODE ?? env.AUTH_TEST_MODE ?? (devServer ? "true" : "false");

  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_AUTH_TEST_MODE": JSON.stringify(authTestMode),
      ...(mobile ? { "import.meta.env.VITE_API_BASE_URL": JSON.stringify("") } : {}),
    },
    server: {
      // Must match the origin allowed by Spring CORS (app.cors.allowed-origins).
      port: 3000,
      strictPort: true,
      // Same-origin API for dev:mobile. The browser's Origin (e.g. http://192.168.x.x:3000) is dropped because
      // Spring would reject it as a CORS request from an unlisted origin; CSRF tokens still protect every write.
      proxy: {
        "/api": {
          target: "http://localhost:8080",
          // Typed by hand: the proxy is a Node EventEmitter, but @types/node is not installed here.
          configure: (proxy) =>
            (proxy as unknown as ProxyEvents).on("proxyReq", (proxyReq) => proxyReq.removeHeader("origin")),
        },
      },
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
