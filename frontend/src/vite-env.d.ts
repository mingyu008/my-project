/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** "true": test-mode sign-in screens (see auth/authMode.ts). */
  readonly VITE_AUTH_TEST_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
