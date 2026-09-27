import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, clearCsrfToken } from "../../api/client";
import type { ScheduleSummary } from "../../api/scheduleApi";
import { callsTo, jsonResponse, routeFetch } from "../../test/http";
import { stubMatchMedia } from "../../test/media";
import { MOBILE_QUERY, TABLET_QUERY } from "../../layout/useMediaQuery";
import { CALENDAR_MESSAGES, ScheduleCalendarPage } from "./ScheduleCalendarPage";

const ALICE = { id: 1, loginIdentifier: "alice" };
const BOB = { id: 2, loginIdentifier: "bob" };

function schedule(id: number, title: string, startAt: string, endAt: string, extra: Partial<ScheduleSummary> = {}): ScheduleSummary {
  return {
    id,
    title,
    startAt,
    endAt,
    status: "PLANNED",
    priority: "NORMAL",
    assignee: BOB,
    location: null,
    isPublic: false,
    color: null,
    createdBy: ALICE,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...extra,
  };
}

const ITEMS = [
  schedule(1, "Kickoff", "2026-09-15T09:00:00", "2026-09-15T10:00:00"),
  schedule(2, "Workshop", "2026-09-15T13:00:00", "2026-09-16T12:00:00", { status: "IN_PROGRESS" }),
  schedule(3, "Review", "2026-09-15T15:00:00", "2026-09-15T16:00:00", { status: "CANCELLED" }),
  schedule(4, "Retro", "2026-09-15T17:00:00", "2026-09-15T18:00:00", { color: "#e03131" }),
];

function Where() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/schedule/calendar" element={<ScheduleCalendarPage />} />
        <Route path="/schedule/:id" element={<p>detail</p>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

function mockCalendar(items: ScheduleSummary[] = ITEMS, truncated = false) {
  return routeFetch([
    ["GET", /\/api\/schedules\/assignees$/, () => jsonResponse(200, [ALICE, BOB])],
    ["GET", /\/api\/schedules\/calendar\?/, () => jsonResponse(200, { items, truncated })],
  ]);
}

const day = (label: string) => screen.getByRole("region", { name: label });

describe("ScheduleCalendarPage", () => {
  beforeEach(() => clearCsrfToken());
  afterEach(() => vi.unstubAllGlobals());

  it("shows a 6-week month from the URL date and requests exactly that range", async () => {
    const fetchMock = mockCalendar();
    renderAt("/schedule/calendar?date=2026-09-10");

    expect(await screen.findByRole("heading", { name: "2026년 9월" })).toBeInTheDocument();
    await screen.findByRole("link", { name: /Kickoff/ });
    expect(callsTo(fetchMock, "GET", /calendar/)[0].url).toBe(`${API_BASE_URL}/api/schedules/calendar?from=2026-08-30&to=2026-10-10`);
    expect(screen.getAllByRole("region")).toHaveLength(42);

    const sept15 = day("2026년 9월 15일 (화)");
    expect(within(sept15).getByRole("link", { name: /09:00 Kickoff/ })).toHaveAttribute("href", "/schedule/1");
    // Three per cell, the rest behind "+N개 더".
    expect(within(sept15).getAllByRole("link")).toHaveLength(3);
    expect(within(sept15).getByRole("button", { name: "2026년 9월 15일 (화) 일정 1개 더 보기" })).toHaveTextContent("+1개 더");
    // Status is available as text, not only as color.
    expect(within(sept15).getByRole("link", { name: /Review \(취소\)/ })).toBeInTheDocument();
    // A multi-day schedule continues on the next day.
    expect(within(day("2026년 9월 16일 (수)")).getByRole("link", { name: /\(계속\) Workshop/ })).toBeInTheDocument();
  });

  it("opens the week of a crowded day with every schedule and time ranges", async () => {
    const fetchMock = mockCalendar();
    const user = renderAt("/schedule/calendar?date=2026-09-10");

    await user.click(await screen.findByRole("button", { name: /9월 15일 \(화\) 일정 1개 더 보기/ }));

    expect(await screen.findByRole("heading", { name: "2026.09.13 – 09.19" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/schedule/calendar?date=2026-09-15&view=week");
    await waitFor(() =>
      expect(callsTo(fetchMock, "GET", /calendar/).at(-1)?.url).toBe(
        `${API_BASE_URL}/api/schedules/calendar?from=2026-09-13&to=2026-09-19`,
      ),
    );
    const sept15 = day("2026년 9월 15일 (화)");
    await within(sept15).findByRole("link", { name: /Retro/ });
    expect(within(sept15).getAllByRole("link")).toHaveLength(4);
    expect(within(sept15).getByRole("link", { name: /09:00–10:00 Kickoff/ })).toBeInTheDocument();
    expect(within(sept15).getByText("진행중")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "주간" })).toHaveAttribute("aria-pressed", "true");
  });

  it("moves between months and back to today", async () => {
    const fetchMock = mockCalendar([]);
    const user = renderAt("/schedule/calendar?date=2026-09-10");
    await screen.findByRole("heading", { name: "2026년 9월" });

    await user.click(screen.getByRole("button", { name: "다음 달" }));
    expect(await screen.findByRole("heading", { name: "2026년 10월" })).toBeInTheDocument();
    await waitFor(() => expect(callsTo(fetchMock, "GET", /calendar/).at(-1)?.url).toMatch(/from=2026-09-27&to=2026-11-07$/));

    await user.click(screen.getByRole("button", { name: "이전 달" }));
    await user.click(screen.getByRole("button", { name: "이전 달" }));
    expect(await screen.findByRole("heading", { name: "2026년 8월" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "오늘" }));
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/schedule\/calendar$/);
  });

  it("sends status and assignee filters and keeps them in the URL", async () => {
    const fetchMock = mockCalendar([]);
    const user = renderAt("/schedule/calendar?date=2026-09-10");
    await screen.findAllByRole("option", { name: "bob" });

    await user.selectOptions(screen.getByLabelText("상태"), "COMPLETED");
    await user.selectOptions(screen.getByLabelText("담당자"), "2");

    await waitFor(() =>
      expect(callsTo(fetchMock, "GET", /calendar/).at(-1)?.url).toBe(
        `${API_BASE_URL}/api/schedules/calendar?from=2026-08-30&to=2026-10-10&status=COMPLETED&assigneeId=2`,
      ),
    );
    expect(screen.getByTestId("location")).toHaveTextContent("status=COMPLETED&assigneeId=2");
  });

  it("ignores an invalid date parameter and tells when results were cut", async () => {
    mockCalendar([], true);
    renderAt("/schedule/calendar?date=2026-02-30&view=bogus");

    expect(await screen.findByText(CALENDAR_MESSAGES.truncated)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "월간" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows an error when the calendar cannot be loaded", async () => {
    routeFetch([
      ["GET", /\/api\/schedules\/assignees$/, () => jsonResponse(200, [])],
      ["GET", /\/api\/schedules\/calendar\?/, () => jsonResponse(500, { code: "UNKNOWN", message: "x" })],
    ]);
    renderAt("/schedule/calendar?date=2026-09-10");

    expect(await screen.findByText(CALENDAR_MESSAGES.error)).toBeInTheDocument();
  });
});

describe("ScheduleCalendarPage on phones", () => {
  beforeEach(() => {
    clearCsrfToken();
    stubMatchMedia(MOBILE_QUERY, TABLET_QUERY);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows a compact month where tapping a day lists its schedules", async () => {
    mockCalendar();
    const user = renderAt("/schedule/calendar?date=2026-09-10");

    const sept15 = await screen.findByRole("button", { name: "2026년 9월 15일 (화) 일정 4건" });
    expect(screen.getByRole("button", { name: "2026년 9월 10일 (목) 일정 0건" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "2026년 9월 10일 (목) 일정" })).toBeInTheDocument();

    await user.click(sept15);

    expect(screen.getByTestId("location")).toHaveTextContent("date=2026-09-15");
    const agenda = await screen.findByRole("region", { name: "2026년 9월 15일 (화) 일정" });
    // The agenda is the only place with links in the compact month.
    await within(agenda).findByRole("link", { name: /09:00–10:00 Kickoff/ });
    expect(within(agenda).getAllByRole("link")).toHaveLength(4);
    expect(screen.getByRole("heading", { name: "2026년 9월" })).toBeInTheDocument();
  });
});
