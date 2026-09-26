import { vi, type Mock } from "vitest";

export function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const CSRF_BODY = { headerName: "X-XSRF-TOKEN", token: "csrf-token-1" };

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

/**
 * Replaces global fetch. Each call is answered by the next handler in order.
 */
export function mockFetch(...handlers: Handler[]): Mock {
  const queue = [...handlers];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const handler = queue.shift();
    if (!handler) throw new Error(`Unexpected fetch: ${String(input)}`);
    return handler(String(input), init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function requestAt(fetchMock: Mock, index: number): { url: string; init: RequestInit; headers: Record<string, string> } {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return { url, init, headers: (init.headers ?? {}) as Record<string, string> };
}
