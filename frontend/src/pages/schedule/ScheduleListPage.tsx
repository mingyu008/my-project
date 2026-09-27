import {
  CellStyleModule,
  InfiniteRowModelModule,
  ModuleRegistry,
  PaginationModule,
  ValidationModule,
  type ColDef,
  type IDatasource,
} from "ag-grid-community";
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  SCHEDULE_PAGE_SIZE,
  SCHEDULE_PRIORITIES,
  SCHEDULE_STATUSES,
  scheduleApi,
  type SchedulePage,
  type ScheduleSearch,
  type ScheduleSummary,
  type UserRef,
} from "../../api/scheduleApi";
import { useGridTheme } from "../../layout/gridTheme";
import { MOBILE_QUERY, TABLET_QUERY, useMediaQuery } from "../../layout/useMediaQuery";
import { formatDateTime } from "../board/boardMessages";
import {
  formatLocalDateTime,
  PRIORITY_LABELS,
  safeColor,
  SCHEDULE_MESSAGES,
  scheduleErrorMessage,
  STATUS_LABELS,
} from "./scheduleMessages";

ModuleRegistry.registerModules([
  InfiniteRowModelModule,
  PaginationModule,
  CellStyleModule,
  ...(import.meta.env.DEV ? [ValidationModule] : []),
]);

/** Columns hidden on tablet-width screens. */
const NARROW_HIDDEN = new Set(["location", "createdBy", "createdAt", "updatedAt"]);

function TitleCell({ data }: CustomCellRendererProps<ScheduleSummary>) {
  if (!data) return null;
  const color = safeColor(data.color);
  return (
    <Link to={`/schedule/${data.id}`}>
      {color && <span className="color-dot" style={{ backgroundColor: color }} aria-hidden="true" />}
      {data.title}
    </Link>
  );
}

function StatusCell({ data }: CustomCellRendererProps<ScheduleSummary>) {
  if (!data) return null;
  // Text label is always shown; color is only a supplement.
  return <span className={`badge status-${data.status.toLowerCase()}`}>{STATUS_LABELS[data.status]}</span>;
}

function PriorityCell({ data }: CustomCellRendererProps<ScheduleSummary>) {
  if (!data) return null;
  return <span className={`priority priority-${data.priority.toLowerCase()}`}>{PRIORITY_LABELS[data.priority]}</span>;
}

const COLUMNS: ColDef<ScheduleSummary>[] = [
  { field: "id", headerName: "ID", width: 80 },
  {
    field: "title",
    headerName: "제목",
    flex: 2,
    minWidth: 200,
    cellRenderer: TitleCell,
  },
  {
    field: "startAt",
    headerName: "시작 일시",
    width: 160,
    valueFormatter: (p) => (p.value ? formatLocalDateTime(p.value) : ""),
  },
  {
    field: "endAt",
    headerName: "종료 일시",
    width: 160,
    valueFormatter: (p) => (p.value ? formatLocalDateTime(p.value) : ""),
  },
  { field: "status", headerName: "상태", width: 100, cellRenderer: StatusCell },
  {
    field: "priority",
    headerName: "우선순위",
    width: 100,
    cellRenderer: PriorityCell,
  },
  {
    colId: "assignee",
    headerName: "담당자",
    width: 120,
    sortable: false,
    valueGetter: (p) => p.data?.assignee?.loginIdentifier ?? "",
  },
  {
    field: "location",
    headerName: "장소",
    flex: 1,
    minWidth: 120,
    sortable: false,
  },
  {
    colId: "createdBy",
    headerName: "등록자",
    width: 120,
    sortable: false,
    valueGetter: (p) => p.data?.createdBy.loginIdentifier ?? "",
  },
  {
    field: "createdAt",
    headerName: "등록일",
    width: 170,
    valueFormatter: (p) => (p.value ? formatDateTime(p.value) : ""),
  },
  {
    field: "updatedAt",
    headerName: "수정일",
    width: 170,
    valueFormatter: (p) => (p.value ? formatDateTime(p.value) : ""),
  },
];

/**
 * Infinite row model with pagination: each grid block is one server page (block size = page size).
 */
export function createScheduleDatasource(search: ScheduleSearch, onError: (message: string | null) => void): IDatasource {
  return {
    getRows(params) {
      const [sort] = params.sortModel;
      scheduleApi
        .list({
          ...search,
          page: Math.floor(params.startRow / SCHEDULE_PAGE_SIZE),
          size: SCHEDULE_PAGE_SIZE,
          sort: sort ? `${sort.colId},${sort.sort}` : undefined,
        })
        .then((result) => {
          onError(null);
          params.successCallback(result.content, result.totalElements);
        })
        .catch((error: unknown) => {
          params.failCallback();
          // 401 -> null: the app redirects to login globally.
          const message = scheduleErrorMessage(error);
          if (message) onError(message === SCHEDULE_MESSAGES.generic ? SCHEDULE_MESSAGES.listError : message);
        });
    },
  };
}

interface SearchForm {
  keyword: string;
  from: string;
  to: string;
  status: string;
  priority: string;
  assigneeId: string;
  createdById: string;
}

const EMPTY_FORM: SearchForm = {
  keyword: "",
  from: "",
  to: "",
  status: "",
  priority: "",
  assigneeId: "",
  createdById: "",
};

function toSearch(form: SearchForm): ScheduleSearch {
  return {
    keyword: form.keyword.trim() || undefined,
    from: form.from || undefined,
    to: form.to || undefined,
    status: (form.status || undefined) as ScheduleSearch["status"],
    priority: (form.priority || undefined) as ScheduleSearch["priority"],
    assigneeId: form.assigneeId ? Number(form.assigneeId) : undefined,
    createdById: form.createdById ? Number(form.createdById) : undefined,
  };
}

type CardLoad = { status: "loading" } | { status: "loaded"; page: SchedulePage } | { status: "error"; message: string };

const CARD_SORTS = [
  { value: "", label: "시작 일시 최신순" },
  { value: "startAt,asc", label: "시작 일시 오래된순" },
  { value: "title,asc", label: "제목순" },
] as const;

/**
 * Phone layout: server-paged cards instead of the grid. Mount with a key per search so paging restarts.
 */
function ScheduleCards({ search }: { search: ScheduleSearch }) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState("");
  const [load, setLoad] = useState<CardLoad>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ status: "loading" });
    scheduleApi
      .list({ ...search, page, size: SCHEDULE_PAGE_SIZE, sort: sort || undefined }, controller.signal)
      .then((result) => setLoad({ status: "loaded", page: result }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        const message = scheduleErrorMessage(e);
        if (message)
          setLoad({
            status: "error",
            message: message === SCHEDULE_MESSAGES.generic ? SCHEDULE_MESSAGES.listError : message,
          });
      });
    return () => controller.abort();
  }, [search, page, sort]);

  return (
    <section aria-label="일정 목록">
      <div className="card-toolbar">
        <label htmlFor="card-sort" className="inline-label">
          정렬
        </label>
        <select
          id="card-sort"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(0);
          }}
        >
          {CARD_SORTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {load.status === "loaded" && <span className="muted">총 {load.page.totalElements}건</span>}
      </div>
      {load.status === "loading" && <p role="status">{SCHEDULE_MESSAGES.loading}</p>}
      {load.status === "error" && <p role="alert">{load.message}</p>}
      {load.status === "loaded" && load.page.content.length === 0 && <p className="empty">일정이 없습니다.</p>}
      {load.status === "loaded" && load.page.content.length > 0 && (
        <>
          <ul className="card-list">
            {load.page.content.map((s) => {
              const color = safeColor(s.color);
              return (
                <li key={s.id} className="schedule-card">
                  <Link to={`/schedule/${s.id}`} className="schedule-card-title">
                    {color && <span className="color-dot" style={{ backgroundColor: color }} aria-hidden="true" />}
                    {s.title}
                  </Link>
                  <div className="schedule-card-badges">
                    <span className={`badge status-${s.status.toLowerCase()}`}>{STATUS_LABELS[s.status]}</span>
                    <span className={`priority priority-${s.priority.toLowerCase()}`}>{PRIORITY_LABELS[s.priority]}</span>
                  </div>
                  <p className="schedule-card-time">
                    {formatLocalDateTime(s.startAt)} ~ {formatLocalDateTime(s.endAt)}
                  </p>
                  <p className="muted schedule-card-meta">
                    담당 {s.assignee?.loginIdentifier ?? "-"}
                    {s.location && <> · {s.location}</>}
                  </p>
                </li>
              );
            })}
          </ul>
          <nav aria-label="페이지" className="pagination">
            <button type="button" className="secondary small" onClick={() => setPage(page - 1)} disabled={page === 0}>
              이전
            </button>
            <span>
              {page + 1} / {Math.max(load.page.totalPages, 1)}
            </span>
            <button
              type="button"
              className="secondary small"
              onClick={() => setPage(page + 1)}
              disabled={page + 1 >= load.page.totalPages}
            >
              다음
            </button>
          </nav>
        </>
      )}
    </section>
  );
}

export function ScheduleListPage() {
  const [form, setForm] = useState<SearchForm>(EMPTY_FORM);
  const [search, setSearch] = useState<ScheduleSearch>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRef[]>([]);
  const tablet = useMediaQuery(TABLET_QUERY);
  const mobile = useMediaQuery(MOBILE_QUERY);
  const gridTheme = useGridTheme();
  // Phones show only the keyword until the other filters are opened.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const showFilters = !mobile || filtersOpen;

  useEffect(() => {
    const controller = new AbortController();
    // Without the list the user filters are just empty; searching still works.
    scheduleApi.assignees(controller.signal).then(setUsers, () => undefined);
    return () => controller.abort();
  }, []);

  const datasource = useMemo(() => createScheduleDatasource(search, setLoadError), [search]);
  const columns = useMemo(
    () =>
      COLUMNS.map((col) => ({
        ...col,
        hide: tablet && NARROW_HIDDEN.has(col.colId ?? col.field ?? ""),
      })),
    [tablet],
  );

  const update = (key: keyof SearchForm) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.from && form.to && form.from > form.to) {
      setFormError(SCHEDULE_MESSAGES.periodInvalid);
      return;
    }
    setFormError(null);
    setSearch(toSearch(form));
  }

  function handleReset() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setSearch({});
  }

  const userOptions = users.map((u) => (
    <option key={u.id} value={u.id}>
      {u.loginIdentifier}
    </option>
  ));

  return (
    <main className="wide">
      <div className="page-header">
        <h1>일정관리</h1>
        <nav className="actions">
          <Link to="/" className="btn secondary">
            홈으로
          </Link>
          <Link to="/schedule/calendar" className="btn secondary">
            달력 보기
          </Link>
          <Link to="/schedule/new" className="btn">
            새 일정
          </Link>
        </nav>
      </div>

      <form className="search-panel" onSubmit={handleSearch} noValidate aria-label="일정 검색">
        <div className="field">
          <label htmlFor="search-keyword">검색어</label>
          <input id="search-keyword" value={form.keyword} onChange={update("keyword")} placeholder="제목" />
        </div>
        {showFilters && (
          <>
            <div className="field">
              <label htmlFor="search-from">시작일</label>
              <input id="search-from" type="date" value={form.from} onChange={update("from")} />
            </div>
            <div className="field">
              <label htmlFor="search-to">종료일</label>
              <input id="search-to" type="date" value={form.to} onChange={update("to")} />
            </div>
            <div className="field">
              <label htmlFor="search-status">상태</label>
              <select id="search-status" value={form.status} onChange={update("status")}>
                <option value="">전체</option>
                {SCHEDULE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="search-priority">우선순위</label>
              <select id="search-priority" value={form.priority} onChange={update("priority")}>
                <option value="">전체</option>
                {SCHEDULE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="search-assignee">담당자</label>
              <select id="search-assignee" value={form.assigneeId} onChange={update("assigneeId")}>
                <option value="">전체</option>
                {userOptions}
              </select>
            </div>
            <div className="field">
              <label htmlFor="search-created-by">등록자</label>
              <select id="search-created-by" value={form.createdById} onChange={update("createdById")}>
                <option value="">전체</option>
                {userOptions}
              </select>
            </div>
          </>
        )}
        <div className="actions search-actions">
          <button type="submit">검색</button>
          <button type="button" className="secondary" onClick={handleReset}>
            초기화
          </button>
          {mobile && (
            <button type="button" className="secondary" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
              {filtersOpen ? "상세 검색 닫기" : "상세 검색"}
            </button>
          )}
        </div>
        {formError && <p role="alert">{formError}</p>}
      </form>

      {loadError && !mobile && <p role="alert">{loadError}</p>}
      {mobile ? (
        <ScheduleCards key={JSON.stringify(search)} search={search} />
      ) : (
        <div className="grid-box schedule-grid">
          <AgGridReact<ScheduleSummary>
            theme={gridTheme}
            columnDefs={columns}
            defaultColDef={{ sortable: true }}
            rowModelType="infinite"
            datasource={datasource}
            cacheBlockSize={SCHEDULE_PAGE_SIZE}
            pagination
            paginationPageSize={SCHEDULE_PAGE_SIZE}
            paginationPageSizeSelector={false}
            maxConcurrentDatasourceRequests={1}
          />
        </div>
      )}
    </main>
  );
}
