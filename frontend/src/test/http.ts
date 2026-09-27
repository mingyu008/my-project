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

export type FetchRoute = [method: string, pattern: RegExp, respond: Handler];

/**
 * Replaces global fetch, answering by method + URL (for screens that fire concurrent requests in no fixed order).
 * Every matching call gets the route's response; later routes win over earlier ones; unmatched calls fail the test.
 */
export function routeFetch(routes: FetchRoute[]): Mock {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const route = [...routes].reverse().find(([m, p]) => m === method && p.test(url));
    if (!route) throw new Error(`Unexpected fetch: ${method} ${url}`);
    return route[2](url, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function callsTo(fetchMock: Mock, method: string, pattern: RegExp): Array<{ url: string; init: RequestInit }> {
  return (fetchMock.mock.calls as Array<[string, RequestInit | undefined]>)
    .map(([url, init]) => ({ url: String(url), init: init ?? {} }))
    .filter(({ url, init }) => (init.method ?? "GET") === method && pattern.test(url));
}
