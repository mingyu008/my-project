/**
 * Common API client. Every call to the Spring API — including AG Grid datasources — goes through here.
 *
 * - The session lives only in the HttpOnly cookie; `credentials: "include"` makes the browser send it.
 *   This module never reads, stores, or forwards a session ID.
 * - The CSRF token is kept in memory only (never localStorage/sessionStorage/URL) and attached to
 *   state-changing requests.
 */

export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const SAFE_METHODS: ReadonlySet<HttpMethod> = new Set(["GET"]);

export type ApiErrorCode =
  | "NETWORK_ERROR"
  | "UNAUTHENTICATED"
  | "AUTHENTICATION_FAILED"
  | "FORBIDDEN"
  | "CSRF_INVALID"
  | "TOO_MANY_ATTEMPTS"
  | "MALFORMED_REQUEST"
  | "UNKNOWN";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | string;

  constructor(status: number, code: ApiErrorCode | string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface CsrfToken {
  headerName: string;
  token: string;
}

let csrfToken: CsrfToken | null = null;
let csrfTokenRequest: Promise<CsrfToken> | null = null;

/**
 * Forget the current CSRF token. Call after login/logout: the server rotates it with the session.
 */
export function clearCsrfToken(): void {
  csrfToken = null;
  csrfTokenRequest = null;
}

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/**
 * Notified when any request returns 401 (session missing or expired). Returns an unsubscribe function.
 */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw e;
    }
    throw new ApiError(0, "NETWORK_ERROR", "Network error");
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let code: string = response.status === 401 ? "UNAUTHENTICATED" : "UNKNOWN";
  let message = `Request failed with status ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object") {
      const { code: bodyCode, message: bodyMessage } = body as Record<string, unknown>;
      if (typeof bodyCode === "string") code = bodyCode;
      if (typeof bodyMessage === "string") message = bodyMessage;
    }
  } catch {
    // Non-JSON error body: keep defaults.
  }
  return new ApiError(response.status, code, message);
}

async function getCsrfToken(): Promise<CsrfToken> {
  if (csrfToken) return csrfToken;
  // Share one in-flight request between concurrent callers.
  csrfTokenRequest ??= (async () => {
    const response = await send("/api/auth/csrf", { method: "GET", headers: { Accept: "application/json" } });
    if (!response.ok) throw await toApiError(response);
    const token = (await response.json()) as CsrfToken;
    csrfToken = token;
    return token;
  })().finally(() => {
    csrfTokenRequest = null;
  });
  return csrfTokenRequest;
}

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const response = await sendWithCsrf(path, method, options, true);

  if (!response.ok) {
    const error = await toApiError(response);
    // A failed login is also 401 but does not mean an existing session was lost.
    if (error.status === 401 && error.code === "UNAUTHENTICATED") {
      unauthorizedListeners.forEach((listener) => listener());
    }
    throw error;
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function sendWithCsrf(
  path: string,
  method: HttpMethod,
  options: RequestOptions,
  retryOnCsrfFailure: boolean,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (!SAFE_METHODS.has(method)) {
    const csrf = await getCsrfToken();
    headers[csrf.headerName] = csrf.token;
  }

  const response = await send(path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  // The token may be stale (session expired or rotated): fetch a new one and retry once.
  if (retryOnCsrfFailure && response.status === 403 && !SAFE_METHODS.has(method)) {
    const error = await toApiError(response.clone());
    if (error.code === "CSRF_INVALID") {
      clearCsrfToken();
      return sendWithCsrf(path, method, options, false);
    }
  }
  return response;
}

export const apiClient = {
  get: <T>(path: string, signal?: AbortSignal) => apiRequest<T>(path, { method: "GET", signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) => apiRequest<T>(path, { method: "POST", body, signal }),
  put: <T>(path: string, body?: unknown, signal?: AbortSignal) => apiRequest<T>(path, { method: "PUT", body, signal }),
  patch: <T>(path: string, body?: unknown, signal?: AbortSignal) => apiRequest<T>(path, { method: "PATCH", body, signal }),
  delete: <T>(path: string, signal?: AbortSignal) => apiRequest<T>(path, { method: "DELETE", signal }),
};
