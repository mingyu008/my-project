import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CSRF_BODY, jsonResponse, mockFetch, requestAt } from "../test/http";
import { authApi } from "./authApi";
import { API_BASE_URL, apiClient, clearCsrfToken } from "./client";

const USER = { id: 1, loginIdentifier: "alice", roles: ["USER"] };

describe("authApi", () => {
  beforeEach(() => clearCsrfToken());
  afterEach(() => vi.unstubAllGlobals());

  it("follows csrf -> login and posts the credentials", async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, CSRF_BODY), () => jsonResponse(200, USER));

    await expect(authApi.login({ username: "alice", password: "pw" })).resolves.toEqual(USER);

    expect(requestAt(fetchMock, 0).url).toBe(`${API_BASE_URL}/api/auth/csrf`);
    const login = requestAt(fetchMock, 1);
    expect(login.url).toBe(`${API_BASE_URL}/api/auth/login`);
    expect(login.init.method).toBe("POST");
    expect(login.headers["X-XSRF-TOKEN"]).toBe("csrf-token-1");
    expect(JSON.parse(login.init.body as string)).toEqual({ username: "alice", password: "pw" });
  });

  it("fetches a new CSRF token after login because the server rotates it", async () => {
    const fetchMock = mockFetch(
      () => jsonResponse(200, CSRF_BODY),
      () => jsonResponse(200, USER),
      () => jsonResponse(200, { headerName: "X-XSRF-TOKEN", token: "csrf-token-after-login" }),
      () => jsonResponse(200, {}),
    );

    await authApi.login({ username: "alice", password: "pw" });
    await apiClient.post("/api/things");

    expect(requestAt(fetchMock, 2).url).toBe(`${API_BASE_URL}/api/auth/csrf`);
    expect(requestAt(fetchMock, 3).headers["X-XSRF-TOKEN"]).toBe("csrf-token-after-login");
  });

  it("logout() posts with CSRF and discards the token afterwards", async () => {
    const fetchMock = mockFetch(
      () => jsonResponse(200, CSRF_BODY),
      () => new Response(null, { status: 204 }),
      () => jsonResponse(200, { headerName: "X-XSRF-TOKEN", token: "csrf-token-new-session" }),
      () => jsonResponse(200, USER),
    );

    await authApi.logout();
    await authApi.login({ username: "alice", password: "pw" });

    const logout = requestAt(fetchMock, 1);
    expect(logout.url).toBe(`${API_BASE_URL}/api/auth/logout`);
    expect(logout.init.method).toBe("POST");
    expect(logout.headers["X-XSRF-TOKEN"]).toBe("csrf-token-1");
    expect(requestAt(fetchMock, 2).url).toBe(`${API_BASE_URL}/api/auth/csrf`);
    expect(requestAt(fetchMock, 3).headers["X-XSRF-TOKEN"]).toBe("csrf-token-new-session");
  });

  it("logout() discards the token even when the request fails", async () => {
    mockFetch(
      () => jsonResponse(200, CSRF_BODY),
      () => {
        throw new TypeError("Failed to fetch");
      },
    );

    await expect(authApi.logout()).rejects.toMatchObject({ code: "NETWORK_ERROR" });

    const fetchMock = mockFetch(() => jsonResponse(200, CSRF_BODY), () => jsonResponse(200, {}));
    await apiClient.post("/api/things");
    expect(requestAt(fetchMock, 0).url).toBe(`${API_BASE_URL}/api/auth/csrf`);
  });

  it("me() calls GET /api/auth/me with credentials", async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, USER));

    await expect(authApi.me()).resolves.toEqual(USER);

    const me = requestAt(fetchMock, 0);
    expect(me.url).toBe(`${API_BASE_URL}/api/auth/me`);
    expect(me.init.method).toBe("GET");
    expect(me.init.credentials).toBe("include");
  });
});
