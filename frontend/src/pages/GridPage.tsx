import { CellStyleModule, InfiniteRowModelModule, ModuleRegistry, ValidationModule, type ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { createGridDatasource, type GridRow } from "../grid/gridDataService";
import { useGridTheme } from "../layout/gridTheme";

// Register only what this grid uses. ValidationModule reports missing modules/options in development only.
ModuleRegistry.registerModules([InfiniteRowModelModule, CellStyleModule, ...(import.meta.env.DEV ? [ValidationModule] : [])]);

export const GRID_ERROR_MESSAGES = {
  forbidden: "데이터를 조회할 권한이 없습니다.",
  generic: "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
} as const;

const COLUMNS: ColDef<GridRow>[] = [
  { field: "id", headerName: "ID", width: 90 },
  { field: "name", headerName: "이름", flex: 1 },
  { field: "category", headerName: "분류" },
  { field: "price", headerName: "가격", type: "numericColumn" },
  { field: "quantity", headerName: "수량", type: "numericColumn" },
];

export function GridPage() {
  const [error, setError] = useState<string | null>(null);
  const theme = useGridTheme();

  const datasource = useMemo(
    () =>
      createGridDatasource((e) => {
        if (e instanceof ApiError && e.status === 401) return; // redirected to login globally
        setError(e instanceof ApiError && e.status === 403 ? GRID_ERROR_MESSAGES.forbidden : GRID_ERROR_MESSAGES.generic);
      }),
    [],
  );

  return (
    <main>
      <div className="page-header">
        <h1>데이터 그리드</h1>
        <Link to="/" className="btn secondary">
          홈으로
        </Link>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="grid-box">
        <AgGridReact<GridRow>
          theme={theme}
          columnDefs={COLUMNS}
          defaultColDef={{ sortable: true }}
          rowModelType="infinite"
          datasource={datasource}
          cacheBlockSize={100}
          maxConcurrentDatasourceRequests={2}
        />
      </div>
    </main>
  );
}
