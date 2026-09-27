import { describe, expect, it } from "vitest";

/**
 * Static guard for TASK-05 security rules over all application source (tests excluded).
 */
const sources = import.meta.glob<string>(["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}", "!../test/**"], {
  query: "?raw",
  import: "default",
  eager: true,
});

const FORBIDDEN: Array<[string, RegExp]> = [
  ["localStorage access", /\blocalStorage\s*[.[]/],
  ["sessionStorage access", /\bsessionStorage\s*[.[]/],
  ["document.cookie access", /document\s*\.\s*cookie/],
  ["console output", /\bconsole\s*\.\s*\w+\s*\(/],
  ["Authorization header", /["']authorization["']/i],
  ["session ID in URL", /jsessionid/i],
  // User content (posts) must be rendered as text; React escapes it unless these are used.
  ["raw HTML rendering", /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML/],
  ["dynamic code evaluation", /\beval\s*\(|new\s+Function\s*\(/],
];

describe("source policy", () => {
  it("scans application sources", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(3);
  });

  it("calls fetch only from the common API client", () => {
    const offenders = Object.entries(sources)
      .filter(([file, content]) => !file.endsWith("/api/client.ts") && /\bfetch\s*\(/.test(content))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it.each(FORBIDDEN)("contains no %s", (_name, pattern) => {
    const offenders = Object.entries(sources)
      .filter(([, content]) => pattern.test(content))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
