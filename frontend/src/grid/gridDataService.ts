import type { IDatasource, IGetRowsParams, SortModelItem } from "ag-grid-community";
import { apiClient } from "../api/client";

/**
 * AG Grid -> Grid Data Service -> Common API Client -> Spring API.
 * The grid never calls fetch itself and never sees the session or CSRF token.
 */

export interface GridRow {
  id: number;
  name: string;
  category: string;
  price: number;
  quantity: number;
}

export interface GridBlock {
  rows: GridRow[];
  lastRow: number;
}

export interface GridBlockRequest {
  startRow: number;
  endRow: number;
  sortModel?: SortModelItem[];
}

export function fetchGridBlock({ startRow, endRow, sortModel = [] }: GridBlockRequest, signal?: AbortSignal): Promise<GridBlock> {
  const params = new URLSearchParams({ startRow: String(startRow), endRow: String(endRow) });
  const [sort] = sortModel;
  if (sort) {
    params.set("sortField", sort.colId);
    params.set("sortDirection", sort.sort);
  }
  return apiClient.get<GridBlock>(`/api/grid/data?${params.toString()}`, signal);
}

/**
 * Infinite row model datasource. 401 is handled globally by the API client (redirect to login);
 * other failures are reported through {@code onError}.
 */
export function createGridDatasource(onError?: (error: unknown) => void): IDatasource {
  return {
    getRows(params: IGetRowsParams) {
      fetchGridBlock(params)
        .then((block) => params.successCallback(block.rows, block.lastRow))
        .catch((error: unknown) => {
          params.failCallback();
          onError?.(error);
        });
    },
  };
}
