import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCsrfToken } from "../../api/client";
import type { Reward } from "../../api/rewardApi";
import type { StudyDayReview } from "../../api/studyApi";
import { AuthProvider } from "../../auth/AuthContext";
import { callsTo, CSRF_BODY, jsonResponse, routeFetch, type FetchRoute } from "../../test/http";
import { FORBIDDEN_MESSAGE } from "../ForbiddenPage";
import { REWARD_MESSAGES, rewardTargetLabel } from "../reward/rewardMessages";
import { seoulToday, StudyReviewPage } from "./StudyReviewPage";

const TEACHER = { id: 3, loginIdentifier: "teacher", nickname: "선생님", roles: ["USER", "CONFIRMER"] };
const STUDENT = { id: 1, loginIdentifier: "minsu", roles: ["USER"] };
const TODAY = seoulToday();

function reward(overrides: Partial<Reward> = {}): Reward {
  const user = { id: 1, loginIdentifier: "minsu" };
  return {
    id: 50,
    source: "STUDY",
    scheduleId: null,
    scheduleTitle: null,
    studyDate: TODAY,
    studySec: 5400,
    recipient: user,
    points: 300,
    reason: "열심히",
    status: "PENDING",
    createdBy: { id: 3, loginIdentifier: "teacher" },
    createdAt: "2026-09-28T12:00:00Z",
    updatedBy: { id: 3, loginIdentifier: "teacher" },
    updatedAt: "2026-09-28T12:00:00Z",
    paidAt: null,
    version: 0,
    manageable: true,
    ...overrides,
  };
}

function day(withReward = false): StudyDayReview {
  return {
    date: TODAY,
    students: [
      {
        student: { id: 2, loginIdentifier: "jiwoo", nickname: "지우" },
        totalSec: 7200,
        timerSec: 0,
        manualSec: 7200,
        sessionCount: 1,
        reward: null,
      },
      {
        student: { id: 1, loginIdentifier: "minsu", nickname: "민수" },
        totalSec: 5400,
        timerSec: 4800,
        manualSec: 600,
        sessionCount: 3,
        reward: withReward ? reward() : null,
      },
    ],
  };
}

function renderAs(user: object, routes: FetchRoute[]) {
  const fetchMock = routeFetch([
    ["GET", /\/api\/auth\/me$/, () => jsonResponse(200, user)],
    ["GET", /\/api\/auth\/csrf$/, () => jsonResponse(200, CSRF_BODY)],
    ...routes,
  ]);
  render(
    <MemoryRouter initialEntries={["/study/review"]}>
      <AuthProvider>
        <Routes>
          <Route path="/study/review" element={<StudyReviewPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
  return { fetchMock, user: userEvent.setup() };
}

describe("StudyReviewPage", () => {
  beforeEach(() => clearCsrfToken());
  afterEach(() => vi.unstubAllGlobals());

  it("lists students with timer and hand-entered time apart", async () => {
    renderAs(TEACHER, [["GET", /\/api\/study\/review\?date=/, () => jsonResponse(200, day())]]);

    const list = await screen.findByRole("list", { name: "학생별 공부 기록" });
    const cards = within(list).getAllByRole("listitem");
    expect(within(cards[0]).getByText("지우 (jiwoo)")).toBeInTheDocument();
    expect(within(cards[0]).getByText("직접 입력이 더 많아요")).toBeInTheDocument();
    expect(within(cards[1]).getByText("01:30:00")).toBeInTheDocument();
    expect(within(cards[1]).getByText("01:20:00")).toBeInTheDocument(); // timer
    expect(within(cards[1]).queryByText("직접 입력이 더 많아요")).not.toBeInTheDocument();
  });

  it("shows a student's records", async () => {
    const { user } = renderAs(TEACHER, [
      ["GET", /\/api\/study\/review\?date=/, () => jsonResponse(200, day())],
      [
        "GET",
        /\/api\/study\/review\/1\?date=/,
        () =>
          jsonResponse(200, {
            student: { id: 1, loginIdentifier: "minsu", nickname: "민수" },
            date: TODAY,
            totalSec: 5400,
            timerSec: 4800,
            manualSec: 600,
            reward: null,
            sessions: [
              { id: 7, subjectName: "수학", mode: "STOPWATCH", startTime: "2026-09-28T10:00:00Z", endTime: "2026-09-28T11:20:00Z", durationSec: 4800 },
              { id: 8, subjectName: "영어", mode: "MANUAL", startTime: null, endTime: null, durationSec: 600 },
            ],
          }),
      ],
    ]);

    const cards = within(await screen.findByRole("list", { name: "학생별 공부 기록" })).getAllByRole("listitem");
    await user.click(within(cards[1]).getByRole("button", { name: "기록 보기" }));

    const sessions = await screen.findByRole("list", { name: "minsu 공부 기록" });
    expect(within(sessions).getByText("19:00~20:20")).toBeInTheDocument(); // Asia/Seoul
    expect(within(sessions).getByText("✍️ 직접 입력")).toBeInTheDocument();
  });

  it("rewards a study day and reloads", async () => {
    let rewarded = false;
    const { fetchMock, user } = renderAs(TEACHER, [
      ["GET", /\/api\/study\/review\?date=/, () => jsonResponse(200, day(rewarded))],
      [
        "POST",
        /\/api\/study\/review\/1\/reward$/,
        () => {
          rewarded = true;
          return jsonResponse(201, reward());
        },
      ],
    ]);

    const cards = within(await screen.findByRole("list", { name: "학생별 공부 기록" })).getAllByRole("listitem");
    await user.click(within(cards[1]).getByRole("button", { name: "🏆 보상 주기" }));
    const form = screen.getByRole("form", { name: "minsu 보상" });
    await user.clear(within(form).getByLabelText("포인트"));
    await user.type(within(form).getByLabelText("포인트"), "300");
    await user.click(within(form).getByRole("button", { name: "보상 등록" }));

    expect(await screen.findByText("300P", { exact: false })).toBeInTheDocument();
    const [post] = callsTo(fetchMock, "POST", /reward$/);
    expect(JSON.parse(post.init.body as string)).toMatchObject({ date: TODAY, points: 300 });
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("maps a duplicate reward to a message", async () => {
    const { user } = renderAs(TEACHER, [
      ["GET", /\/api\/study\/review\?date=/, () => jsonResponse(200, day())],
      ["POST", /\/api\/study\/review\/1\/reward$/, () => jsonResponse(409, { code: "STUDY_REWARD_EXISTS", message: "x" })],
    ]);

    const cards = within(await screen.findByRole("list", { name: "학생별 공부 기록" })).getAllByRole("listitem");
    await user.click(within(cards[1]).getByRole("button", { name: "🏆 보상 주기" }));
    await user.click(screen.getByRole("button", { name: "보상 등록" }));

    expect(await screen.findByText(REWARD_MESSAGES.studyRewardExists)).toBeInTheDocument();
  });

  it("is not available to students", async () => {
    const { fetchMock } = renderAs(STUDENT, []);

    expect(await screen.findByText(FORBIDDEN_MESSAGE)).toBeInTheDocument();
    expect(callsTo(fetchMock, "GET", /\/api\/study\/review/)).toHaveLength(0);
  });
});

describe("rewardTargetLabel", () => {
  it("describes study and schedule rewards", () => {
    expect(rewardTargetLabel(reward({ studyDate: "2026-09-28", studySec: 9000 }))).toBe("9월 28일 공부 (2시간 30분)");
    expect(rewardTargetLabel(reward({ studyDate: "2026-09-28", studySec: 1800 }))).toBe("9월 28일 공부 (30분)");
    expect(rewardTargetLabel(reward({ source: "SCHEDULE", scheduleId: 7, scheduleTitle: "Release" }))).toBe("Release");
  });
});
