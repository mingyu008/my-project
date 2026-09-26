import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./LoginPage";

describe("safeRedirectPath", () => {
  it.each([
    ["/grid", "/grid"],
    ["/users?page=2", "/users?page=2"],
  ])("keeps in-app path %s", (from, expected) => {
    expect(safeRedirectPath(from)).toBe(expected);
  });

  it.each([undefined, null, 42, "", "https://evil.example.com", "//evil.example.com", "/\\evil.example.com", "grid", "/login", "/login?x=1"])(
    "falls back to / for %s",
    (from) => {
      expect(safeRedirectPath(from)).toBe("/");
    },
  );
});
