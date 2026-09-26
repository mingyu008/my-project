import type { IGetRowsParams } from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, clearCsrfToken, onUnauthorized } from "../api/client";
import { jsonResponse, mockFetch, requestAt } from "../test/http";
import { createGridDatasource, fetchGridBlock } from "./gridDataService";

const BLOCK = {
  rows: [{ id: 1, name: "Item 001", category: "Book", price: 1.37, quantity: 7 }],
  lastRow: 250,
};

function getRowsParams(overrides: Partial<IGetRowsParams> = {}) {
  return {
    startRow: 0,
    endRow: 100,
    sortModel: [],
    filterModel: {},
    successCallback: vi.fn(),
    failCallback: vi.fn(),
    ...overrides,
  } as unknown as IGetRowsParams & { successCallback: ReturnType<typeof vi.fn>; failCallback: ReturnType<typeof vi.fn> };
}

describe("gridDataService", () => {
  beforeEach(() => clearCsrfToken());
  afterEach(() => vi.unstubAllGlobals());

  it("requests a block through the common API client", async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, BLOCK));

    await expect(fetchGridBlock({ startRow: 100, endRow: 200 })).resolves.toEqual(BLOCK);

    const { url, init, headers } = requestAt(fetchMock, 0);
    expect(url).toBe(`${API_BASE_URL}/api/grid/data?startRow=100&endRow=200`);
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain("authorization");
  });

  it("maps the AG Grid sort model to query parameters", async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, BLOCK));

    await fetchGridBlock({ startRow: 0, endRow: 100, sortModel: [{ colId: "price", sort: "desc" }] });

    expect(requestAt(fetchMock, 0).url).toBe(
      `${API_BASE_URL}/api/grid/data?startRow=0&endRow=100&sortField=price&sortDirection=desc`,
    );
  });

  it("datasource passes rows and lastRow to AG Grid", async () => {
    mockFetch(() => jsonResponse(200, BLOCK));
    const params = getRowsParams();

    createGridDatasource().getRows(params);

    await vi.waitFor(() => expect(params.successCallback).toHaveBeenCalledWith(BLOCK.rows, 250));
    expect(params.failCallback).not.toHaveBeenCalled();
  });

  it("datasource reports failures to AG Grid and the caller", async () => {
    mockFetch(() => jsonResponse(403, { code: "FORBIDDEN", message: "Access denied" }));
    const params = getRowsParams();
    const onError = vi.fn();

    createGridDatasource(onError).getRows(params);

    await vi.waitFor(() => expect(params.failCallback).toHaveBeenCalled());
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ status: 403, code: "FORBIDDEN" }));
  });

  it("an expired session during grid loading triggers the global 401 handling", async () => {
    mockFetch(() => jsonResponse(401, { code: "UNAUTHENTICATED", message: "Authentication required" }));
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);
    const params = getRowsParams();

    createGridDatasource().getRows(params);

    await vi.waitFor(() => expect(params.failCallback).toHaveBeenCalled());
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
