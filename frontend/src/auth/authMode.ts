/**
 * Test version of sign-in: signup with ID + Hangul nickname, login with the nickname only.
 * Build-time switch that must match the server's app.auth.test-mode (both come from AUTH_TEST_MODE in
 * the Docker build; the local default is set in vite.config.ts).
 */
export const AUTH_TEST_MODE = import.meta.env.VITE_AUTH_TEST_MODE === "true";
