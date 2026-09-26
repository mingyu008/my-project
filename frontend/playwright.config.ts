import { defineConfig } from "@playwright/test";

/**
 * Full-stack E2E: real Chrome on http://localhost:3000 (Vite) calling Spring on http://localhost:8080
 * (profile "e2e": seeded fixture users, in-memory DB). Both servers are started here.
 */
export default defineConfig({
  testDir: "./e2e",
  // One backend instance with shared state (rate-limit counters): run serially.
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "mvn -q -f ../backend/pom.xml spring-boot:run -Dspring-boot.run.profiles=e2e",
      url: "http://localhost:8080/api/auth/csrf",
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
});
