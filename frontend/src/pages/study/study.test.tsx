import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCsrfToken } from "../../api/client";
import type { StudySession, StudySummary } from "../../api/studyApi";
import { callsTo, CSRF_BODY, jsonResponse, routeFetch, type FetchRoute } from "../../test/http";
import { clearStopQueue } from "./stopQueue";
import { STUDY_MESSAGES } from "./studyMessages";
import { StudyTimerPage } from "./StudyTimerPage";

const SUBJECTS = [
  { id: 1, name: "수학" },
  { id: 2, name: "영어" },
  { id: 3, name: "국어" },
];

function summary(totalByName: Record<string, number> = {}, date = "2026-09-01"): StudySummary {
  const subjects = SUBJECTS.map((s) => ({ subjectId: s.id, name: s.name, durationSec: totalByName[s.name] ?? 0 }));
  return { date, totalSec: subjects.reduce((a, s) => a + s.durationSec, 0), goalSec: 8 * 3600, subjects };
}

function session(overrides: Partial<StudySession> = {}): StudySession {
  const now = new Date().toISOString();
  return {
    id: 10,
    subjectId: 1,
    subjectName: "수학",
    mode: "STOPWATCH",
    recordDate: "2026-09-01",
    startTime: now,
    endTime: null,
    pausedAt: null,
    pausedSec: 0,
    plannedSec: null,
    durationSec: 0,
    completed: false,
    serverTime: now,
    ...overrides,
  };
}

const CSRF: FetchRoute = ["GET", /\/api\/auth\/csrf$/, () => jsonResponse(200, CSRF_BODY)];

function baseRoutes(options: { active?: StudySession; summary?: () => StudySummary } = {}): FetchRoute[] {
  return [
    CSRF,
    ["GET", /\/api\/study\/subjects$/, () => jsonResponse(200, SUBJECTS)],
    ["GET", /\/api\/study\/summary/, () => jsonResponse(200, (options.summary ?? (() => summary()))())],
    ["GET", /\/api\/study\/sessions\/active$/, () => (options.active ? jsonResponse(200, options.active) : new Response(null, { status: 204 }))],
  ];
}

const body = (call: { init: RequestInit }) => JSON.parse(call.init.body as string);

async function renderPage() {
  render(<StudyTimerPage />);
  await screen.findByRole("heading", { name: "📚 오늘의 공부" });
  return userEvent.setup();
}

describe("StudyTimerPage", () => {
  beforeEach(() => {
    clearCsrfToken();
    clearStopQueue();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows today's total, the goal rate and per-subject time", async () => {
    routeFetch(baseRoutes({ summary: () => summary({ 수학: 4800, 영어: 2400, 국어: 1800 }) }));
    await renderPage();

    expect(screen.getByText("02시간 30분")).toBeInTheDocument();
    expect(screen.getByText(/목표 08시간 00분 · 31%/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "목표 달성률" })).toHaveAttribute("aria-valuenow", "31");
    const totals = screen.getByRole("list", { name: "오늘의 과목별 공부시간" });
    expect(within(totals).getByText("01:20:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "수학" })).toHaveAttribute("aria-pressed", "true");
  });

  it("adds 30 minutes to the selected subject with one tap (scenario B)", async () => {
    let total: Record<string, number> = {};
    const fetchMock = routeFetch([
      ...baseRoutes({ summary: () => summary(total) }),
      [
        "POST",
        /\/api\/study\/sessions\/manual$/,
        () => {
          total = { 영어: 1800 };
          return jsonResponse(201, session({ mode: "MANUAL", subjectId: 2, subjectName: "영어", durationSec: 1800, completed: true }));
        },
      ],
    ]);
    const user = await renderPage();

    await user.click(screen.getByRole("button", { name: "영어" }));
    await user.click(screen.getByRole("button", { name: "+30분" }));

    expect(await screen.findByText("✓ 영어 공부시간 30분이 추가되었습니다.")).toBeInTheDocument();
    expect(body(callsTo(fetchMock, "POST", /manual$/)[0])).toEqual({ subjectId: 2, durationSec: 1800 });
    expect(await screen.findByText("00시간 30분")).toBeInTheDocument();
  });

  it("starts a stopwatch, confirms and saves on stop (scenario A)", async () => {
    const fetchMock = routeFetch([
      ...baseRoutes(),
      ["POST", /\/api\/study\/sessions\/start$/, () => jsonResponse(201, session())],
      ["POST", /\/api\/study\/sessions\/10\/stop$/, () => jsonResponse(200, session({ completed: true, durationSec: 1800 }))],
    ]);
    const user = await renderPage();

    await user.click(screen.getByRole("button", { name: "▶ 공부 시작" }));
    expect(await screen.findByText("수학 공부 중")).toBeInTheDocument();
    expect(body(callsTo(fetchMock, "POST", /start$/)[0])).toEqual({ subjectId: 1, mode: "STOPWATCH" });
    // Subjects are locked while studying.
    expect(screen.getByRole("button", { name: "영어" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "■ 공부 종료" }));
    expect(screen.getByText(STUDY_MESSAGES.stopConfirm)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "저장하고 종료" }));

    expect(await screen.findByText("✓ 수학 30분 기록했어요.")).toBeInTheDocument();
    expect(body(callsTo(fetchMock, "POST", /stop$/)[0]).endTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(screen.getByRole("button", { name: "▶ 공부 시작" })).toBeInTheDocument();
  });

  it("can end without saving", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = routeFetch([
      ...baseRoutes(),
      ["POST", /\/api\/study\/sessions\/start$/, () => jsonResponse(201, session())],
      ["DELETE", /\/api\/study\/sessions\/10$/, () => new Response(null, { status: 204 })],
    ]);
    const user = await renderPage();

    await user.click(screen.getByRole("button", { name: "▶ 공부 시작" }));
    await user.click(await screen.findByRole("button", { name: "■ 공부 종료" }));
    await user.click(screen.getByRole("button", { name: "저장 안 함" }));

    expect(await screen.findByText("기록하지 않고 종료했어요.")).toBeInTheDocument();
    expect(callsTo(fetchMock, "DELETE", /sessions\/10$/)).toHaveLength(1);
    expect(callsTo(fetchMock, "POST", /stop$/)).toHaveLength(0);
  });

  it("queues a stop that fails offline and sends it when the network is back (scenario E)", async () => {
    let online = false;
    const fetchMock = routeFetch([
      ...baseRoutes(),
      ["POST", /\/api\/study\/sessions\/start$/, () => jsonResponse(201, session())],
      [
        "POST",
        /\/api\/study\/sessions\/10\/stop$/,
        () => {
          if (!online) throw new TypeError("Failed to fetch");
          return jsonResponse(200, session({ completed: true, durationSec: 1200 }));
        },
      ],
    ]);
    const user = await renderPage();

    await user.click(screen.getByRole("button", { name: "▶ 공부 시작" }));
    await user.click(await screen.findByRole("button", { name: "■ 공부 종료" }));
    await user.click(screen.getByRole("button", { name: "저장하고 종료" }));

    expect(await screen.findByText(STUDY_MESSAGES.savedOffline)).toBeInTheDocument();
    expect(screen.getByText(STUDY_MESSAGES.pendingSaves(1))).toBeInTheDocument();
    const firstEnd = body(callsTo(fetchMock, "POST", /stop$/)[0]).endTime;

    online = true;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    expect(await screen.findByText(STUDY_MESSAGES.flushed)).toBeInTheDocument();
    expect(screen.queryByText(STUDY_MESSAGES.pendingSaves(1))).not.toBeInTheDocument();
    const stops = callsTo(fetchMock, "POST", /stop$/);
    expect(stops).toHaveLength(2);
    // The retry carries the original press time, not the time of reconnection.
    expect(body(stops[1]).endTime).toBe(firstEnd);
  });

  it("offers to resume a session that was open before the refresh (AC-06)", async () => {
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    routeFetch(baseRoutes({ active: session({ subjectId: 2, subjectName: "영어", startTime: twentyMinutesAgo }) }));
    const user = await renderPage();

    const dialog = screen.getByRole("alertdialog", { name: STUDY_MESSAGES.recoveryTitle });
    expect(within(dialog).getByText(/영어/)).toBeInTheDocument();
    // Elapsed time comes from the server start time, not from how long the page has been open.
    expect(within(dialog).getByText(/^00:(19|20):\d{2}$/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "이어서 진행" }));
    expect(screen.getByText("영어 공부 중")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "⏸ 일시정지" })).toBeInTheDocument();
  });

  it("can end and save a recovered session", async () => {
    const fetchMock = routeFetch([
      ...baseRoutes({ active: session() }),
      ["POST", /\/api\/study\/sessions\/10\/stop$/, () => jsonResponse(200, session({ completed: true, durationSec: 600 }))],
    ]);
    const user = await renderPage();

    await user.click(screen.getByRole("button", { name: "종료하고 저장" }));

    expect(await screen.findByText("✓ 수학 10분 기록했어요.")).toBeInTheDocument();
    expect(callsTo(fetchMock, "POST", /sessions\/10\/stop$/)).toHaveLength(1);
  });

  it("pauses and resumes through the server", async () => {
    const fetchMock = routeFetch([
      ...baseRoutes(),
      ["POST", /\/api\/study\/sessions\/start$/, () => jsonResponse(201, session())],
      ["POST", /\/api\/study\/sessions\/10\/pause$/, () => jsonResponse(200, session({ pausedAt: new Date().toISOString() }))],
      ["POST", /\/api\/study\/sessions\/10\/resume$/, () => jsonResponse(200, session({ pausedSec: 5 }))],
    ]);
    const user = await renderPage();

    await user.click(screen.getByRole("button", { name: "▶ 공부 시작" }));
    await user.click(await screen.findByRole("button", { name: "⏸ 일시정지" }));
    expect(await screen.findByText("수학 · 일시정지")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "▶ 계속하기" }));

    expect(await screen.findByText("수학 공부 중")).toBeInTheDocument();
    expect(callsTo(fetchMock, "POST", /pause$/)).toHaveLength(1);
    expect(callsTo(fetchMock, "POST", /resume$/)).toHaveLength(1);
  });

  it("starts a pomodoro focus with the preset length", async () => {
    const fetchMock = routeFetch([
      ...baseRoutes(),
      ["POST", /\/api\/study\/sessions\/start$/, () => jsonResponse(201, session({ mode: "POMODORO_FOCUS", plannedSec: 3000 }))],
    ]);
    const user = await renderPage();

    await user.click(screen.getByRole("button", { name: "🍅 뽀모도로" }));
    await user.click(screen.getByRole("button", { name: "실전" }));
    expect(screen.getByText("50:00")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "▶ 집중 시작" }));

    expect(await screen.findByText("수학 집중 중")).toBeInTheDocument();
    expect(body(callsTo(fetchMock, "POST", /start$/)[0])).toEqual({ subjectId: 1, mode: "POMODORO_FOCUS", plannedSec: 3000 });
    expect(screen.getByRole("button", { name: "건너뛰기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "■ 저장/종료" })).toBeInTheDocument();
  });

  it("records hours and minutes from the direct-input sheet (scenario C)", async () => {
    const fetchMock = routeFetch([
      ...baseRoutes(),
      [
        "POST",
        /\/api\/study\/sessions\/manual$/,
        () => jsonResponse(201, session({ mode: "MANUAL", subjectId: 3, subjectName: "국어", durationSec: 4800, completed: true })),
      ],
    ]);
    const user = await renderPage();

    await user.click(screen.getByRole("button", { name: "직접 입력" }));
    const sheet = screen.getByRole("dialog", { name: "공부시간 추가" });
    await user.selectOptions(within(sheet).getByLabelText("과목"), "3");
    await user.clear(within(sheet).getByLabelText("시간"));
    await user.type(within(sheet).getByLabelText("시간"), "1");
    await user.clear(within(sheet).getByLabelText("분"));
    await user.type(within(sheet).getByLabelText("분"), "20");
    await user.click(within(sheet).getByRole("button", { name: "저장" }));

    expect(await screen.findByText("✓ 국어 공부시간 1시간 20분이 추가되었습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(body(callsTo(fetchMock, "POST", /manual$/)[0])).toEqual({ subjectId: 3, durationSec: 4800, recordDate: "2026-09-01" });
  });

  it("records a start/end period in Asia/Seoul time", async () => {
    const fetchMock = routeFetch([
      ...baseRoutes(),
      ["POST", /\/api\/study\/sessions\/manual$/, () => jsonResponse(201, session({ mode: "MANUAL", durationSec: 5400, completed: true }))],
    ]);
    const user = await renderPage();

    await user.click(screen.getByRole("button", { name: "직접 입력" }));
    const sheet = screen.getByRole("dialog", { name: "공부시간 추가" });
    await user.click(within(sheet).getByRole("button", { name: "시작 · 종료" }));
    expect(within(sheet).getByText("총 1시간 30분")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "저장" }));

    await screen.findByText("✓ 수학 공부시간 1시간 30분이 추가되었습니다.");
    expect(body(callsTo(fetchMock, "POST", /manual$/)[0])).toEqual({
      subjectId: 1,
      startTime: "2026-09-01T10:00:00.000Z",
      endTime: "2026-09-01T11:30:00.000Z",
    });
  });

  it("validates the sheet before calling the API", async () => {
    const fetchMock = routeFetch(baseRoutes());
    const user = await renderPage();

    await user.click(screen.getByRole("button", { name: "직접 입력" }));
    const sheet = screen.getByRole("dialog", { name: "공부시간 추가" });
    await user.clear(within(sheet).getByLabelText("시간"));
    await user.type(within(sheet).getByLabelText("시간"), "0");
    await user.click(within(sheet).getByRole("button", { name: "저장" }));

    expect(within(sheet).getByText(STUDY_MESSAGES.durationInvalid)).toBeInTheDocument();
    expect(callsTo(fetchMock, "POST", /manual$/)).toHaveLength(0);
  });

  it("adds a subject and selects it", async () => {
    const fetchMock = routeFetch([...baseRoutes(), ["POST", /\/api\/study\/subjects$/, () => jsonResponse(201, { id: 9, name: "한국사" })]]);
    const user = await renderPage();

    await user.click(screen.getByRole("button", { name: "+ 추가" }));
    await user.type(screen.getByLabelText("새 과목 이름"), "한국사");
    await user.click(screen.getByRole("button", { name: "추가" }));

    expect(await screen.findByRole("button", { name: "한국사" })).toHaveAttribute("aria-pressed", "true");
    expect(body(callsTo(fetchMock, "POST", /subjects$/)[0])).toEqual({ name: "한국사" });
  });

  it("shows a message when another session is already running", async () => {
    let active: StudySession | undefined;
    routeFetch([
      CSRF,
      ["GET", /\/api\/study\/subjects$/, () => jsonResponse(200, SUBJECTS)],
      ["GET", /\/api\/study\/summary/, () => jsonResponse(200, summary())],
      ["GET", /\/api\/study\/sessions\/active$/, () => (active ? jsonResponse(200, active) : new Response(null, { status: 204 }))],
      [
        "POST",
        /\/api\/study\/sessions\/start$/,
        () => {
          active = session({ subjectName: "수학" });
          return jsonResponse(409, { code: "ACTIVE_SESSION_EXISTS", message: "x" });
        },
      ],
    ]);
    const user = await renderPage();

    await user.click(screen.getByRole("button", { name: "▶ 공부 시작" }));

    expect(await screen.findByText(STUDY_MESSAGES.activeExists)).toBeInTheDocument();
    expect(screen.getByRole("alertdialog", { name: STUDY_MESSAGES.recoveryTitle })).toBeInTheDocument();
  });
});
