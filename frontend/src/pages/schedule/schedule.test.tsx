import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { API_BASE_URL, clearCsrfToken } from "../../api/client";
import type { ScheduleDetail } from "../../api/scheduleApi";
import { AuthProvider } from "../../auth/AuthContext";
import { callsTo, CSRF_BODY, jsonResponse, routeFetch, type FetchRoute } from "../../test/http";
import { stubMatchMedia } from "../../test/media";
import { MOBILE_QUERY, TABLET_QUERY } from "../../layout/useMediaQuery";
import { ScheduleDetailPage } from "./ScheduleDetailPage";
import { ScheduleFormPage } from "./ScheduleFormPage";
import { ScheduleListPage } from "./ScheduleListPage";
import { SCHEDULE_MESSAGES } from "./scheduleMessages";

const ALICE = { id: 1, loginIdentifier: "alice" };
const BOB = { id: 2, loginIdentifier: "bob" };

const SCHEDULE: ScheduleDetail = {
  id: 7,
  title: "Weekly meeting",
  description: "agenda",
  startAt: "2026-09-28T10:00:00",
  endAt: "2026-09-28T11:00:00",
  status: "PLANNED",
  priority: "HIGH",
  assignee: BOB,
  location: "Room A",
  isPublic: false,
  color: "#3788d8",
  createdBy: ALICE,
  createdAt: "2026-09-27T01:00:00Z",
  updatedBy: ALICE,
  updatedAt: "2026-09-27T01:00:00Z",
  version: 3,
  editable: true,
};

/** Default routes for the auth provider and the schedule screens; test routes win over these. */
function routeSchedules(routes: FetchRoute[], roles: string[] = ["USER"]): Mock {
  return routeFetch([
    ["GET", /\/api\/auth\/me$/, () => jsonResponse(200, { ...ALICE, roles })],
    ["GET", /\/api\/auth\/csrf$/, () => jsonResponse(200, CSRF_BODY)],
    ["GET", /\/api\/schedules\/assignees$/, () => jsonResponse(200, [ALICE, BOB])],
    ["GET", /\/api\/schedules\/\d+\/rewards$/, () => jsonResponse(200, { items: [], canManage: false })],
    ...routes,
  ]);
}

function page(content: object[], totalElements = content.length) {
  return { content, page: 0, size: 20, totalElements, totalPages: Math.ceil(totalElements / 20) };
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/schedule" element={<ScheduleListPage />} />
          <Route path="/schedule/new" element={<ScheduleFormPage key="new" />} />
          <Route path="/schedule/:id" element={<ScheduleDetailPage />} />
          <Route path="/schedule/:id/edit" element={<ScheduleFormPage key="edit" />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe("schedule", () => {
  beforeEach(() => clearCsrfToken());
  afterEach(() => vi.unstubAllGlobals());

  describe("list", () => {
    it("loads the first server page into the grid with text labels and detail links", async () => {
      const consoleError = vi.spyOn(console, "error");
      const consoleWarn = vi.spyOn(console, "warn");
      const fetchMock = routeSchedules([["GET", /\/api\/schedules\?/, () => jsonResponse(200, page([SCHEDULE]))]]);
      renderAt("/schedule");

      expect(await screen.findByRole("link", { name: "Weekly meeting" })).toHaveAttribute("href", "/schedule/7");
      expect(screen.getByText("예정", { selector: ".badge" })).toBeInTheDocument();
      expect(screen.getByText("높음", { selector: ".priority" })).toBeInTheDocument();
      expect(screen.getByText("2026-09-28 10:00")).toBeInTheDocument();

      const [list] = callsTo(fetchMock, "GET", /\/api\/schedules\?/);
      expect(list.url).toBe(`${API_BASE_URL}/api/schedules?page=0&size=20`);
      expect(list.init.credentials).toBe("include");
      // AG Grid reports missing modules / invalid options through the console.
      expect(consoleError).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
    });

    it("sends the search conditions to the server and resets them", async () => {
      const fetchMock = routeSchedules([["GET", /\/api\/schedules\?/, () => jsonResponse(200, page([SCHEDULE]))]]);
      const user = renderAt("/schedule");
      await screen.findByRole("link", { name: "Weekly meeting" });
      await screen.findAllByRole("option", { name: "bob" });

      await user.type(screen.getByLabelText("검색어"), " meeting ");
      await user.type(screen.getByLabelText("시작일"), "2026-09-01");
      await user.type(screen.getByLabelText("종료일"), "2026-09-30");
      await user.selectOptions(screen.getByLabelText("상태"), "IN_PROGRESS");
      await user.selectOptions(screen.getByLabelText("우선순위"), "URGENT");
      await user.selectOptions(screen.getByLabelText("담당자"), "2");
      await user.selectOptions(screen.getByLabelText("등록자"), "1");
      await user.click(screen.getByRole("button", { name: "검색" }));

      await waitFor(() => expect(callsTo(fetchMock, "GET", /\/api\/schedules\?/)).toHaveLength(2));
      expect(callsTo(fetchMock, "GET", /\/api\/schedules\?/)[1].url).toBe(
        `${API_BASE_URL}/api/schedules?keyword=meeting&from=2026-09-01&to=2026-09-30&status=IN_PROGRESS&priority=URGENT&assigneeId=2&createdById=1&page=0&size=20`,
      );

      await user.click(screen.getByRole("button", { name: "초기화" }));
      await waitFor(() => expect(callsTo(fetchMock, "GET", /\/api\/schedules\?/)).toHaveLength(3));
      expect(callsTo(fetchMock, "GET", /\/api\/schedules\?/)[2].url).toBe(`${API_BASE_URL}/api/schedules?page=0&size=20`);
      expect(screen.getByLabelText("검색어")).toHaveValue("");
    });

    it("rejects a reversed search period without calling the server", async () => {
      const fetchMock = routeSchedules([["GET", /\/api\/schedules\?/, () => jsonResponse(200, page([]))]]);
      const user = renderAt("/schedule");
      await waitFor(() => expect(callsTo(fetchMock, "GET", /\/api\/schedules\?/)).toHaveLength(1));

      await user.type(screen.getByLabelText("시작일"), "2026-10-01");
      await user.type(screen.getByLabelText("종료일"), "2026-09-01");
      await user.click(screen.getByRole("button", { name: "검색" }));

      expect(await screen.findByText(SCHEDULE_MESSAGES.periodInvalid)).toBeInTheDocument();
      expect(callsTo(fetchMock, "GET", /\/api\/schedules\?/)).toHaveLength(1);
    });

    it("sends sorting to the server when a header is clicked", async () => {
      const fetchMock = routeSchedules([["GET", /\/api\/schedules\?/, () => jsonResponse(200, page([SCHEDULE]))]]);
      const user = renderAt("/schedule");
      await screen.findByRole("link", { name: "Weekly meeting" });

      await user.click(screen.getByText("제목"));

      await waitFor(() => expect(callsTo(fetchMock, "GET", /\/api\/schedules\?/)).toHaveLength(2));
      expect(callsTo(fetchMock, "GET", /\/api\/schedules\?/)[1].url).toMatch(/&sort=title%2Casc$/);
    });

    it("shows an error message when the list cannot be loaded", async () => {
      routeSchedules([["GET", /\/api\/schedules\?/, () => jsonResponse(500, { code: "UNKNOWN", message: "x" })]]);
      renderAt("/schedule");

      expect(await screen.findByText(SCHEDULE_MESSAGES.listError)).toBeInTheDocument();
    });
  });

  describe("detail", () => {
    it("renders every field, with text as plain text only", async () => {
      const html = "<script>window.__xss = 1</script><img src=x onerror=\"window.__xss=2\">";
      routeSchedules([["GET", /\/api\/schedules\/7$/, () => jsonResponse(200, { ...SCHEDULE, description: html, location: html })]]);
      renderAt("/schedule/7");

      expect(await screen.findByRole("heading", { name: "Weekly meeting" })).toBeInTheDocument();
      const description = screen.getByTestId("schedule-description");
      expect(description.textContent).toBe(html);
      expect(document.querySelector("article script, article img")).toBeNull();
      expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
      expect(screen.getByText("2026-09-28 10:00 ~ 2026-09-28 11:00")).toBeInTheDocument();
      expect(screen.getByText("bob")).toBeInTheDocument();
      expect(screen.getByText("비공개")).toBeInTheDocument();
    });

    it("hides edit/delete when not editable", async () => {
      routeSchedules([["GET", /\/api\/schedules\/7$/, () => jsonResponse(200, { ...SCHEDULE, editable: false })]]);
      renderAt("/schedule/7");

      await screen.findByRole("heading", { name: "Weekly meeting" });
      expect(screen.queryByRole("link", { name: "수정" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
    });

    it("deletes with DELETE + CSRF after confirmation and returns to the list", async () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      const fetchMock = routeSchedules([
        ["GET", /\/api\/schedules\/7$/, () => jsonResponse(200, SCHEDULE)],
        ["DELETE", /\/api\/schedules\/7$/, () => new Response(null, { status: 204 })],
        ["GET", /\/api\/schedules\?/, () => jsonResponse(200, page([]))],
      ]);
      const user = renderAt("/schedule/7");

      await user.click(await screen.findByRole("button", { name: "삭제" }));

      expect(confirm).toHaveBeenCalledWith(SCHEDULE_MESSAGES.deleteConfirm);
      expect(await screen.findByRole("heading", { name: "일정관리" })).toBeInTheDocument();
      const [del] = callsTo(fetchMock, "DELETE", /\/api\/schedules\/7$/);
      expect((del.init.headers as Record<string, string>)["X-XSRF-TOKEN"]).toBe(CSRF_BODY.token);
    });

    it("does nothing when deletion is not confirmed", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const fetchMock = routeSchedules([["GET", /\/api\/schedules\/7$/, () => jsonResponse(200, SCHEDULE)]]);
      const user = renderAt("/schedule/7");

      await user.click(await screen.findByRole("button", { name: "삭제" }));

      expect(callsTo(fetchMock, "DELETE", /./)).toHaveLength(0);
    });

    it("shows not found for an unknown schedule", async () => {
      routeSchedules([["GET", /\/api\/schedules\/99$/, () => jsonResponse(404, { code: "NOT_FOUND", message: "Not found" })]]);
      renderAt("/schedule/99");

      expect(await screen.findByText(SCHEDULE_MESSAGES.notFound)).toBeInTheDocument();
    });
  });

  describe("form", () => {
    async function fillRequired(user: ReturnType<typeof userEvent.setup>, start = "2026-09-28T10:00", end = "2026-09-28T11:00") {
      await user.type(screen.getByLabelText("제목 *"), "  Kickoff  ");
      await user.type(screen.getByLabelText("시작 일시 *"), start);
      await user.type(screen.getByLabelText("종료 일시 *"), end);
    }

    it("shows field messages for missing required values without calling the server", async () => {
      const fetchMock = routeSchedules([]);
      const user = renderAt("/schedule/new");

      await user.click(await screen.findByRole("button", { name: "저장" }));

      expect(screen.getByText(SCHEDULE_MESSAGES.titleRequired)).toBeInTheDocument();
      expect(screen.getByText(SCHEDULE_MESSAGES.startRequired)).toBeInTheDocument();
      expect(screen.getByText(SCHEDULE_MESSAGES.endRequired)).toBeInTheDocument();
      expect(screen.getByLabelText("제목 *")).toHaveAttribute("aria-invalid", "true");
      expect(callsTo(fetchMock, "POST", /\/api\/schedules$/)).toHaveLength(0);
    });

    it("flags an end time before the start time immediately", async () => {
      routeSchedules([]);
      const user = renderAt("/schedule/new");

      await user.type(await screen.findByLabelText("시작 일시 *"), "2026-09-28T10:00");
      await user.type(screen.getByLabelText("종료 일시 *"), "2026-09-28T09:00");

      expect(screen.getByText(SCHEDULE_MESSAGES.endBeforeStart)).toBeInTheDocument();
      expect(screen.getByLabelText("종료 일시 *")).toHaveAttribute("aria-invalid", "true");
    });

    it("creates a schedule and opens its detail page", async () => {
      const fetchMock = routeSchedules([
        ["POST", /\/api\/schedules$/, () => jsonResponse(201, { ...SCHEDULE, id: 42, title: "Kickoff" })],
        ["GET", /\/api\/schedules\/42$/, () => jsonResponse(200, { ...SCHEDULE, id: 42, title: "Kickoff" })],
      ]);
      const user = renderAt("/schedule/new");
      await fillRequired(user);
      await user.selectOptions(screen.getByLabelText("우선순위 *"), "URGENT");
      await user.type(screen.getByLabelText("장소"), "Room B");
      await user.selectOptions(screen.getByLabelText("색상"), "#2f9e44");
      await user.click(screen.getByLabelText("다른 사용자에게 공개"));

      await user.click(screen.getByRole("button", { name: "저장" }));

      expect(await screen.findByRole("heading", { name: "Kickoff" })).toBeInTheDocument();
      const [create] = callsTo(fetchMock, "POST", /\/api\/schedules$/);
      expect(JSON.parse(String(create.init.body))).toEqual({
        title: "Kickoff",
        description: null,
        startAt: "2026-09-28T10:00:00",
        endAt: "2026-09-28T11:00:00",
        status: "PLANNED",
        priority: "URGENT",
        assigneeId: null,
        location: "Room B",
        isPublic: true,
        color: "#2f9e44",
      });
      // No assignee -> no conflict check.
      expect(callsTo(fetchMock, "GET", /conflicts/)).toHaveLength(0);
    });

    it("warns about overlapping schedules and saves on the second click", async () => {
      const fetchMock = routeSchedules([
        [
          "GET",
          /\/api\/schedules\/conflicts\?/,
          () =>
            jsonResponse(200, {
              conflict: true,
              items: [{ id: 3, title: "Busy slot", startAt: "2026-09-28T10:30:00", endAt: "2026-09-28T12:00:00" }],
              hiddenCount: 1,
            }),
        ],
        ["POST", /\/api\/schedules$/, () => jsonResponse(201, { ...SCHEDULE, id: 42 })],
        ["GET", /\/api\/schedules\/42$/, () => jsonResponse(200, { ...SCHEDULE, id: 42 })],
      ]);
      const user = renderAt("/schedule/new");
      await screen.findByRole("option", { name: "bob" });
      await fillRequired(user);
      await user.selectOptions(screen.getByLabelText("담당자"), "2");

      await user.click(screen.getByRole("button", { name: "저장" }));

      const warning = await screen.findByRole("alert", { name: "중복 일정 경고" });
      expect(within(warning).getByText(/Busy slot/)).toBeInTheDocument();
      expect(within(warning).getByText("볼 수 없는 일정 1건")).toBeInTheDocument();
      expect(callsTo(fetchMock, "POST", /\/api\/schedules$/)).toHaveLength(0);
      const [check] = callsTo(fetchMock, "GET", /conflicts/);
      expect(check.url).toBe(
        `${API_BASE_URL}/api/schedules/conflicts?assigneeId=2&startAt=2026-09-28T10%3A00%3A00&endAt=2026-09-28T11%3A00%3A00`,
      );

      await user.click(screen.getByRole("button", { name: "그래도 저장" }));

      await waitFor(() => expect(callsTo(fetchMock, "POST", /\/api\/schedules$/)).toHaveLength(1));
      expect(callsTo(fetchMock, "GET", /conflicts/)).toHaveLength(1);
    });

    it("edits with the loaded version and limits status choices for non-admins", async () => {
      const fetchMock = routeSchedules([
        ["GET", /\/api\/schedules\/7$/, () => jsonResponse(200, SCHEDULE)],
        ["GET", /\/api\/schedules\/conflicts\?/, () => jsonResponse(200, { conflict: false, items: [], hiddenCount: 0 })],
        ["PUT", /\/api\/schedules\/7$/, () => jsonResponse(200, { ...SCHEDULE, title: "Renamed", version: 4 })],
      ]);
      const user = renderAt("/schedule/7/edit");

      const title = await screen.findByLabelText("제목 *");
      await waitFor(() => expect(title).toHaveValue("Weekly meeting"));
      const statusOptions = within(screen.getByLabelText("상태 *")).getAllByRole("option").map((o) => o.textContent);
      expect(statusOptions).toEqual(["예정", "진행중", "취소"]);

      await user.clear(title);
      await user.type(title, "Renamed");
      await user.click(screen.getByRole("button", { name: "저장" }));

      await waitFor(() => expect(callsTo(fetchMock, "PUT", /\/api\/schedules\/7$/)).toHaveLength(1));
      const body = JSON.parse(String(callsTo(fetchMock, "PUT", /\/api\/schedules\/7$/)[0].init.body));
      expect(body).toMatchObject({ title: "Renamed", version: 3, assigneeId: 2, startAt: "2026-09-28T10:00:00" });
      // Editing excludes the schedule itself from the conflict check.
      expect(callsTo(fetchMock, "GET", /conflicts/)[0].url).toMatch(/&excludeId=7$/);
    });

    it("offers every status to an admin", async () => {
      routeSchedules([["GET", /\/api\/schedules\/7$/, () => jsonResponse(200, { ...SCHEDULE, status: "COMPLETED" })]], ["USER", "ADMIN"]);
      renderAt("/schedule/7/edit");

      await waitFor(() =>
        expect(within(screen.getByLabelText("상태 *")).getAllByRole("option").map((o) => o.textContent)).toEqual([
          "예정",
          "진행중",
          "완료",
          "취소",
        ]),
      );
    });

    it("explains a concurrent modification (409)", async () => {
      routeSchedules([
        ["GET", /\/api\/schedules\/7$/, () => jsonResponse(200, { ...SCHEDULE, assignee: null })],
        [
          "PUT",
          /\/api\/schedules\/7$/,
          () => jsonResponse(409, { code: "SCHEDULE_VERSION_CONFLICT", message: "changed" }),
        ],
      ]);
      const user = renderAt("/schedule/7/edit");
      await waitFor(() => expect(screen.getByLabelText("제목 *")).toHaveValue("Weekly meeting"));

      await user.click(screen.getByRole("button", { name: "저장" }));

      expect(await screen.findByText(SCHEDULE_MESSAGES.versionConflict)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();
    });

    it("maps a server period error to the end time field", async () => {
      routeSchedules([
        ["POST", /\/api\/schedules$/, () => jsonResponse(400, { code: "INVALID_SCHEDULE_PERIOD", message: "x" })],
      ]);
      const user = renderAt("/schedule/new");
      await fillRequired(user);

      await user.click(screen.getByRole("button", { name: "저장" }));

      expect(await screen.findByText(SCHEDULE_MESSAGES.endBeforeStart)).toBeInTheDocument();
      expect(screen.getByLabelText("종료 일시 *")).toHaveAttribute("aria-invalid", "true");
    });

    it("refuses to edit a schedule the user may not change", async () => {
      routeSchedules([["GET", /\/api\/schedules\/7$/, () => jsonResponse(200, { ...SCHEDULE, editable: false })]]);
      renderAt("/schedule/7/edit");

      expect(await screen.findByText(SCHEDULE_MESSAGES.forbidden)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
    });
  });
});

describe("schedule list on phones", () => {
  beforeEach(() => {
    clearCsrfToken();
    stubMatchMedia(MOBILE_QUERY, TABLET_QUERY);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows server-paged cards instead of the grid", async () => {
    const fetchMock = routeSchedules([["GET", /\/api\/schedules\?/, () => jsonResponse(200, { ...page([SCHEDULE], 25), totalPages: 2 })]]);
    const user = renderAt("/schedule");

    const list = await screen.findByRole("region", { name: "일정 목록" });
    const card = within(list).getByRole("listitem");
    expect(within(card).getByRole("link", { name: "Weekly meeting" })).toHaveAttribute("href", "/schedule/7");
    expect(within(card).getByText("예정")).toBeInTheDocument();
    expect(within(card).getByText("2026-09-28 10:00 ~ 2026-09-28 11:00")).toBeInTheDocument();
    expect(within(list).getByText("총 25건")).toBeInTheDocument();
    expect(document.querySelector(".ag-root")).toBeNull();

    await user.click(within(list).getByRole("button", { name: "다음" }));
    await waitFor(() => expect(callsTo(fetchMock, "GET", /\/api\/schedules\?/).at(-1)?.url).toMatch(/page=1&size=20$/));

    await user.selectOptions(within(list).getByLabelText("정렬"), "title,asc");
    await waitFor(() => expect(callsTo(fetchMock, "GET", /\/api\/schedules\?/).at(-1)?.url).toMatch(/page=0&size=20&sort=title%2Casc$/));
  });

  it("keeps only the keyword visible until detailed search is opened", async () => {
    routeSchedules([["GET", /\/api\/schedules\?/, () => jsonResponse(200, page([]))]]);
    const user = renderAt("/schedule");
    await screen.findByText("일정이 없습니다.");

    expect(screen.getByLabelText("검색어")).toBeInTheDocument();
    expect(screen.queryByLabelText("상태")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "상세 검색" }));

    expect(screen.getByLabelText("상태")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "상세 검색 닫기" })).toHaveAttribute("aria-expanded", "true");
  });
});
