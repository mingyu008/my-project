import { vi } from "vitest";

/**
 * jsdom has no matchMedia (the app then uses the desktop layout). Stub it so the given queries match.
 * Undo with vi.unstubAllGlobals().
 */
export function stubMatchMedia(...matching: string[]): void {
  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList =>
      ({
        matches: matching.includes(query),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}
