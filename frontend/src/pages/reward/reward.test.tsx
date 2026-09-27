import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { API_BASE_URL, clearCsrfToken } from "../../api/client";
import type { Reward } from "../../api/rewardApi";
import type { ScheduleDetail } from "../../api/scheduleApi";
import { AuthProvider } from "../../auth/AuthContext";
import { callsTo, CSRF_BODY, jsonResponse, routeFetch, type FetchRoute } from "../../test/http";
import { ScheduleDetailPage } from "../schedule/ScheduleDetailPage";
import { REWARD_MESSAGES } from "./rewardMessages";
import { RewardsPage } from "./RewardsPage";

const ALICE = { id: 1, loginIdentifier: "alice" };
const BOB = { id: 2, loginIdentifier: "bob" };
const CAROL = { id: 3, loginIdentifier: "carol" };

const SCHEDULE: ScheduleDetail = {
  id: 7,
  title: "Release",
  description: null,
  startAt: "2026-09-28T10:00:00",
  endAt: "2026-09-28T11:00:00",
  status: "COMPLETED",
  priority: "NORMAL",
  assignee: BOB,
  location: null,
  isPublic: false,
  color: null,
  createdBy: ALICE,
  createdAt: "2026-09-27T01:00:00Z",
  updatedBy: ALICE,
  updatedAt: "2026-09-27T01:00:00Z",
  version: 0,
  editable: false,
};

function reward(id: number, extra: Partial<Reward> = {}): Reward {
  return {
    id,
    scheduleId: 7,
    scheduleTitle: "Release",
    recipient: BOB,
    points: 100,
    reason: "On time",
    status: "PENDING",
    createdBy: CAROL,
    createdAt: "2026-09-28T01:00:00Z",
    updatedBy: CAROL,
    updatedAt: "2026-09-28T01:00:00Z",
    paidAt: null,
    version: 0,
    manageable: true,
    ...extra,
  };
}

/** Logged in as carol (CONFIRMER) unless other roles/user are given. */
function routeAs(routes: FetchRoute[], me = CAROL, roles = ["USER", "CONFIRMER"]): Mock {
  return routeFetch([
    ["GET", /\/api\/auth\/me$/, () => jsonResponse(200, { ...me, roles })],
    ["GET", /\/api\/auth\/csrf$/, () => jsonResponse(200, CSRF_BODY)],
    ["GET", /\/api\/schedules\/assignees$/, () => jsonResponse(200, [ALICE, BOB, CAROL])],
    ["GET", /\/api\/schedules\/7$/, () => jsonResponse(200, SCHEDULE)],
    ...routes,
  ]);
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/schedule/:id" element={<ScheduleDetailPage />} />
          <Route path="/rewards" element={<RewardsPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe("rewards", () => {
  beforeEach(() => clearCsrfToken());
  afterEach(() => vi.unstubAllGlobals());

  describe("schedule detail section", () => {
    it("lets a confirmer add a reward, defaulting to the assignee and never offering themselves", async () => {
      const fetchMock = routeAs([
        ["GET", /\/api\/schedules\/7\/rewards$/, () => jsonResponse(200, { items: [], canManage: true })],
        ["POST", /\/api\/schedules\/7\/rewards$/, () => jsonResponse(201, reward(11, { points: 150, reason: "Great" }))],
      ]);
      const user = renderAt("/schedule/7");

      await user.click(await screen.findByRole("button", { name: "보상 추가" }));
      const form = screen.getByRole("form", { name: "보상 입력" });
      await within(form).findByRole("option", { name: "bob" });
      expect(within(form).getByLabelText("수령자 *")).toHaveValue("2");
      expect(within(form).queryByRole("option", { name: "carol" })).not.toBeInTheDocument();

      await user.type(within(form).getByLabelText("포인트 *"), "150");
      await user.type(within(form).getByLabelText("사유 *"), "  Great  ");
      await user.click(within(form).getByRole("button", { name: "추가" }));

      expect(await screen.findByRole("cell", { name: "Great" })).toBeInTheDocument();
      expect(screen.getByRole("cell", { name: "150P" })).toBeInTheDocument();
      const [create] = callsTo(fetchMock, "POST", /rewards$/);
      expect(JSON.parse(String(create.init.body))).toEqual({ recipientId: 2, points: 150, reason: "Great" });
      expect((create.init.headers as Record<string, string>)["X-XSRF-TOKEN"]).toBe(CSRF_BODY.token);
    });

    it("validates the reward form before calling the server", async () => {
      const fetchMock = routeAs([["GET", /\/api\/schedules\/7\/rewards$/, () => jsonResponse(200, { items: [], canManage: true })]]);
      const user = renderAt("/schedule/7");

      await user.click(await screen.findByRole("button", { name: "보상 추가" }));
      const form = screen.getByRole("form", { name: "보상 입력" });
      await user.selectOptions(within(form).getByLabelText("수령자 *"), "");
      await user.type(within(form).getByLabelText("포인트 *"), "100001");
      await user.click(within(form).getByRole("button", { name: "추가" }));

      expect(within(form).getByText(REWARD_MESSAGES.recipientRequired)).toBeInTheDocument();
      expect(within(form).getByText(REWARD_MESSAGES.pointsInvalid)).toBeInTheDocument();
      expect(within(form).getByText(REWARD_MESSAGES.reasonRequired)).toBeInTheDocument();
      expect(callsTo(fetchMock, "POST", /rewards$/)).toHaveLength(0);
    });

    it("pays after confirmation and edits with the loaded version", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const fetchMock = routeAs([
        ["GET", /\/api\/schedules\/7\/rewards$/, () => jsonResponse(200, { items: [reward(11), reward(12, { recipient: ALICE, version: 2 })], canManage: true })],
        ["POST", /\/api\/rewards\/11\/pay$/, () => jsonResponse(200, reward(11, { status: "PAID", paidAt: "2026-09-29T01:00:00Z", manageable: false }))],
        ["PUT", /\/api\/rewards\/12$/, () => jsonResponse(200, reward(12, { recipient: ALICE, points: 40, version: 3 }))],
      ]);
      const user = renderAt("/schedule/7");

      await user.click(await screen.findByRole("button", { name: "bob 보상 지급" }));
      expect(await screen.findByText("지급 완료")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "bob 보상 지급" })).not.toBeInTheDocument();
      expect(window.confirm).toHaveBeenCalledWith(REWARD_MESSAGES.payConfirm);

      await user.click(screen.getByRole("button", { name: "alice 보상 수정" }));
      const points = within(screen.getByRole("form", { name: "보상 입력" })).getByLabelText("포인트 *");
      await user.clear(points);
      await user.type(points, "40");
      await user.click(screen.getByRole("button", { name: "수정 저장" }));

      expect(await screen.findByRole("cell", { name: "40P" })).toBeInTheDocument();
      expect(JSON.parse(String(callsTo(fetchMock, "PUT", /rewards\/12$/)[0].init.body))).toEqual({
        recipientId: 1,
        points: 40,
        reason: "On time",
        version: 2,
      });
    });

    it("explains server refusals", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      routeAs([
        ["GET", /\/api\/schedules\/7\/rewards$/, () => jsonResponse(200, { items: [reward(11)], canManage: true })],
        ["POST", /\/api\/rewards\/11\/pay$/, () => jsonResponse(409, { code: "SCHEDULE_NOT_COMPLETED", message: "x" })],
      ]);
      const user = renderAt("/schedule/7");

      await user.click(await screen.findByRole("button", { name: "bob 보상 지급" }));

      expect(await screen.findByText(REWARD_MESSAGES.notCompleted)).toBeInTheDocument();
    });

    it("tells a confirmer that rewards need a completed schedule", async () => {
      routeAs([
        ["GET", /\/api\/schedules\/7$/, () => jsonResponse(200, { ...SCHEDULE, status: "IN_PROGRESS" })],
        ["GET", /\/api\/schedules\/7\/rewards$/, () => jsonResponse(200, { items: [], canManage: false })],
      ]);
      renderAt("/schedule/7");

      expect(await screen.findByText(REWARD_MESSAGES.notCompleted)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "보상 추가" })).not.toBeInTheDocument();
    });

    it("shows a regular user only their own rewards, read-only, and hides the section when there are none", async () => {
      routeAs(
        [["GET", /\/api\/schedules\/7\/rewards$/, () => jsonResponse(200, { items: [reward(11, { manageable: false })], canManage: false })]],
        BOB,
        ["USER"],
      );
      renderAt("/schedule/7");

      expect(await screen.findByRole("heading", { name: "보상" })).toBeInTheDocument();
      expect(await screen.findByRole("cell", { name: "On time" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /지급|수정|보상 추가/ })).not.toBeInTheDocument();
    });

    it("hides the section from a regular user without rewards", async () => {
      routeAs([["GET", /\/api\/schedules\/7\/rewards$/, () => jsonResponse(200, { items: [], canManage: false })]], ALICE, ["USER"]);
      renderAt("/schedule/7");

      await screen.findByRole("heading", { name: "Release" });
      await waitFor(() => expect(screen.queryByText(REWARD_MESSAGES.loading)).not.toBeInTheDocument());
      expect(screen.queryByRole("heading", { name: "보상" })).not.toBeInTheDocument();
    });
  });

  describe("rewards page", () => {
    const SUMMARY = [
      { recipient: BOB, pendingPoints: 30, paidPoints: 1200, paidCount: 3 },
      { recipient: ALICE, pendingPoints: 0, paidPoints: 50, paidCount: 1 },
    ];
    const PAGE = { content: [reward(11), reward(10, { status: "PAID", paidAt: "2026-09-28T02:00:00Z", manageable: false })], page: 0, size: 20, totalElements: 2, totalPages: 1 };

    it("shows totals and history to a manager, who can pay and filter", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const fetchMock = routeAs([
        ["GET", /\/api\/rewards\/summary$/, () => jsonResponse(200, SUMMARY)],
        ["GET", /\/api\/rewards\?/, () => jsonResponse(200, PAGE)],
        ["POST", /\/api\/rewards\/11\/pay$/, () => jsonResponse(200, reward(11, { status: "PAID" }))],
      ]);
      const user = renderAt("/rewards");

      expect(await screen.findByRole("heading", { name: "보상 관리" })).toBeInTheDocument();
      const totals = await screen.findByRole("table", { name: "포인트 현황" });
      expect(within(totals).getByRole("cell", { name: "1,200P" })).toBeInTheDocument();
      const history = await screen.findByRole("table", { name: "보상 내역" });
      expect(within(history).getAllByRole("link", { name: "Release" })[0]).toHaveAttribute("href", "/schedule/7");
      expect(callsTo(fetchMock, "GET", /\/api\/rewards\?/)[0].url).toBe(`${API_BASE_URL}/api/rewards?page=0&size=20`);

      await user.click(within(history).getByRole("button", { name: "Release bob 보상 지급" }));
      await waitFor(() => expect(callsTo(fetchMock, "POST", /pay$/)).toHaveLength(1));
      // Totals and list are reloaded after a change.
      await waitFor(() => expect(callsTo(fetchMock, "GET", /\/api\/rewards\/summary$/)).toHaveLength(2));

      await user.selectOptions(screen.getByLabelText("상태"), "PENDING");
      await user.selectOptions(screen.getByLabelText("수령자"), "2");
      await waitFor(() =>
        expect(callsTo(fetchMock, "GET", /\/api\/rewards\?/).at(-1)?.url).toBe(
          `${API_BASE_URL}/api/rewards?status=PENDING&recipientId=2&page=0&size=20`,
        ),
      );
    });

    it("shows a regular user their own rewards without management controls", async () => {
      routeAs(
        [
          ["GET", /\/api\/rewards\/summary$/, () => jsonResponse(200, [SUMMARY[0]])],
          ["GET", /\/api\/rewards\?/, () => jsonResponse(200, { ...PAGE, content: PAGE.content.map((r) => ({ ...r, manageable: false })) })],
        ],
        BOB,
        ["USER"],
      );
      renderAt("/rewards");

      expect(await screen.findByRole("heading", { name: "내 보상" })).toBeInTheDocument();
      await screen.findByRole("table", { name: "보상 내역" });
      expect(screen.queryByLabelText("수령자")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /지급/ })).not.toBeInTheDocument();
    });
  });
});
