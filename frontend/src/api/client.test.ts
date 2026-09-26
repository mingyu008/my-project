import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CSRF_BODY, jsonResponse, mockFetch, requestAt } from "../test/http";
import { API_BASE_URL, ApiError, apiClient, clearCsrfToken, onUnauthorized } from "./client";

describe("apiClient", () => {
  beforeEach(() => clearCsrfToken());
  afterEach(() => vi.unstubAllGlobals());

  it("sends GET with credentials and no CSRF header", async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, { ok: true }));

    await expect(apiClient.get("/api/things")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, headers } = requestAt(fetchMock, 0);
    expect(url).toBe(`${API_BASE_URL}/api/things`);
    expect(init.credentials).toBe("include");
    expect(init.method).toBe("GET");
    expect(headers).not.toHaveProperty("X-XSRF-TOKEN");
  });

  it("fetches a CSRF token before the first state-changing request and reuses it", async () => {
    const fetchMock = mockFetch(
      () => jsonResponse(200, CSRF_BODY),
      () => jsonResponse(200, { saved: 1 }),
      () => jsonResponse(200, { saved: 2 }),
    );

    await apiClient.post("/api/things", { name: "a" });
    await apiClient.delete("/api/things/1");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestAt(fetchMock, 0).url).toBe(`${API_BASE_URL}/api/auth/csrf`);
    expect(requestAt(fetchMock, 0).init.credentials).toBe("include");

    const post = requestAt(fetchMock, 1);
    expect(post.init.method).toBe("POST");
    expect(post.init.credentials).toBe("include");
    expect(post.headers["X-XSRF-TOKEN"]).toBe("csrf-token-1");
    expect(post.headers["Content-Type"]).toBe("application/json");
    expect(post.init.body).toBe(JSON.stringify({ name: "a" }));

    expect(requestAt(fetchMock, 2).headers["X-XSRF-TOKEN"]).toBe("csrf-token-1");
  });

  it("shares one CSRF request between concurrent calls", async () => {
    const fetchMock = mockFetch(
      () => jsonResponse(200, CSRF_BODY),
      () => jsonResponse(200, {}),
      () => jsonResponse(200, {}),
    );

    await Promise.all([apiClient.post("/api/a"), apiClient.post("/api/b")]);

    const csrfCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/auth/csrf"));
    expect(csrfCalls).toHaveLength(1);
  });

  it("refreshes the CSRF token and retries once on CSRF_INVALID", async () => {
    const fetchMock = mockFetch(
      () => jsonResponse(200, CSRF_BODY),
      () => jsonResponse(403, { code: "CSRF_INVALID", message: "Missing or invalid CSRF token" }),
      () => jsonResponse(200, { headerName: "X-XSRF-TOKEN", token: "csrf-token-2" }),
      () => jsonResponse(200, { ok: true }),
    );

    await expect(apiClient.post("/api/things")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(requestAt(fetchMock, 3).headers["X-XSRF-TOKEN"]).toBe("csrf-token-2");
  });

  it("does not retry more than once", async () => {
    const csrfInvalid = () => jsonResponse(403, { code: "CSRF_INVALID", message: "x" });
    const fetchMock = mockFetch(() => jsonResponse(200, CSRF_BODY), csrfInvalid, () => jsonResponse(200, CSRF_BODY), csrfInvalid);

    await expect(apiClient.post("/api/things")).rejects.toMatchObject({ status: 403, code: "CSRF_INVALID" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not retry a plain 403", async () => {
    const fetchMock = mockFetch(
      () => jsonResponse(200, CSRF_BODY),
      () => jsonResponse(403, { code: "FORBIDDEN", message: "Access denied" }),
    );

    await expect(apiClient.post("/api/things")).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps 401 to ApiError and notifies unauthorized listeners", async () => {
    mockFetch(() => jsonResponse(401, { code: "UNAUTHENTICATED", message: "Authentication required" }));
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);

    await expect(apiClient.get("/api/auth/me")).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("does not notify unauthorized listeners for a failed login", async () => {
    mockFetch(
      () => jsonResponse(200, CSRF_BODY),
      () => jsonResponse(401, { code: "AUTHENTICATION_FAILED", message: "Invalid login identifier or password" }),
    );
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);

    await expect(apiClient.post("/api/auth/login", {})).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("maps fetch failures to NETWORK_ERROR", async () => {
    mockFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    const error = await apiClient.get("/api/things").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("handles non-JSON error bodies", async () => {
    mockFetch(() => new Response("<html>Bad Gateway</html>", { status: 502 }));

    await expect(apiClient.get("/api/things")).rejects.toMatchObject({ status: 502, code: "UNKNOWN" });
  });

  it("never touches web storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    mockFetch(() => jsonResponse(200, CSRF_BODY), () => jsonResponse(200, {}));

    await apiClient.post("/api/things", {});

    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
  });
});
