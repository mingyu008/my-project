import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * TASK-13 (schedule rewards by a CONFIRMER + calendar) in a real browser against the real API.
 * Fixture accounts: backend/src/main/resources/application-e2e.yml.
 */

const API = "http://localhost:8080";
const USER = { username: "e2e-user", password: "E2e-User-Password-1!" };
const USER2 = { username: "e2e-user2", password: "E2e-User2-Password-1!" };
const ADMIN = { username: "e2e-admin", password: "E2e-Admin-Password-1!" };
const CONFIRMER = { username: "e2e-confirmer", password: "E2e-Confirmer-Password-1!" };

async function loginAs(page: Page, account: { username: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("아이디").fill(account.username);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByText(`${account.username} 님으로 로그인했습니다.`)).toBeVisible();
}

async function newLoggedInPage(browser: Browser, account: { username: string; password: string }) {
  const page = await (await browser.newContext()).newPage();
  await loginAs(page, account);
  return page;
}

async function apiWithCsrf(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(
    async ({ api, method, path, body }) => {
      const csrf = await (await fetch(`${api}/api/auth/csrf`, { credentials: "include" })).json();
      const response = await fetch(`${api}${path}`, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.text() };
    },
    { api: API, method, path, body },
  );
}

async function userIdOf(page: Page, loginIdentifier: string): Promise<number> {
  const response = await page.evaluate(async (api) => (await fetch(`${api}/api/schedules/assignees`, { credentials: "include" })).json(), API);
  return (response as Array<{ id: number; loginIdentifier: string }>).find((u) => u.loginIdentifier === loginIdentifier)!.id;
}

test.describe("rewards and calendar", () => {
  test("admin appoints a confirmer who rewards a completed schedule; the assignee sees the points", async ({ page, browser }) => {
    // e2e-user creates a private schedule for e2e-user2, still in progress.
    await loginAs(page, USER);
    const user2Id = await userIdOf(page, USER2.username);
    const created = await apiWithCsrf(page, "POST", "/api/schedules", {
      title: "E2E reward target",
      description: null,
      startAt: "2026-10-12T10:00:00",
      endAt: "2026-10-12T11:00:00",
      status: "IN_PROGRESS",
      priority: "HIGH",
      assigneeId: user2Id,
      location: null,
      isPublic: false,
      color: "#2f9e44",
    });
    expect(created.status).toBe(201);
    const scheduleId = JSON.parse(created.body).id as number;

    // The confirmer logs in first; the role granted afterwards applies to the existing session.
    const confirmer = await newLoggedInPage(browser, CONFIRMER);
    expect((await apiWithCsrf(confirmer, "GET", `/api/schedules/${scheduleId}`)).status).toBe(404);

    const admin = await newLoggedInPage(browser, ADMIN);
    await admin.goto("/users");
    await admin.getByRole("button", { name: "e2e-confirmer 확인자 지정" }).click();
    await expect(admin.getByRole("button", { name: "e2e-confirmer 확인자 해제" })).toBeVisible();

    // Not completed yet: no reward can be added.
    await confirmer.goto(`/schedule/${scheduleId}`);
    await expect(confirmer.getByRole("heading", { name: "E2E reward target" })).toBeVisible();
    await expect(confirmer.getByText("완료된 일정에만 보상을 추가할 수 있습니다.")).toBeVisible();
    await expect(confirmer.getByRole("button", { name: "보상 추가" })).toHaveCount(0);
    expect(
      (await apiWithCsrf(confirmer, "POST", `/api/schedules/${scheduleId}/rewards`, { recipientId: user2Id, points: 1, reason: "x" })).status,
    ).toBe(409);

    // The creator completes it.
    await page.goto(`/schedule/${scheduleId}/edit`);
    await page.getByLabel("상태 *").selectOption({ label: "완료" });
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("완료", { exact: true })).toBeVisible();

    // The confirmer adds and pays a reward.
    await confirmer.reload();
    await confirmer.getByRole("button", { name: "보상 추가" }).click();
    await expect(confirmer.getByLabel("수령자 *")).toHaveValue(String(user2Id));
    await confirmer.getByLabel("포인트 *").fill("250");
    await confirmer.getByLabel("사유 *").fill("<b>Delivered early</b>");
    await confirmer.getByRole("button", { name: "추가", exact: true }).click();
    await expect(confirmer.getByRole("cell", { name: "<b>Delivered early</b>" })).toBeVisible();
    confirmer.once("dialog", (dialog) => dialog.accept());
    await confirmer.getByRole("button", { name: "e2e-user2 보상 지급" }).click();
    await expect(confirmer.getByText("지급 완료", { exact: true })).toBeVisible();

    // The creator (not a manager) cannot pay or add; sees no rewards.
    expect(
      (await apiWithCsrf(page, "POST", `/api/schedules/${scheduleId}/rewards`, { recipientId: user2Id, points: 1, reason: "x" })).status,
    ).toBe(403);

    // The assignee sees their points.
    const user2 = await newLoggedInPage(browser, USER2);
    await user2.getByRole("link", { name: "내 보상" }).click();
    const totals = user2.getByRole("table", { name: "포인트 현황" });
    await expect(totals.getByRole("row", { name: /e2e-user2/ })).toContainText("250P");
    await expect(user2.getByRole("table", { name: "보상 내역" }).getByRole("link", { name: "E2E reward target" })).toBeVisible();

    // Revoking the role takes effect on the confirmer's session.
    await admin.getByRole("button", { name: "e2e-confirmer 확인자 해제" }).click();
    await expect(admin.getByRole("button", { name: "e2e-confirmer 확인자 지정" })).toBeVisible();
    expect((await apiWithCsrf(confirmer, "GET", `/api/schedules/${scheduleId}`)).status).toBe(404);

    for (const p of [confirmer, admin, user2]) await p.context().close();
  });

  test("calendar shows schedules in month and week views", async ({ page }) => {
    await loginAs(page, USER);
    for (const [title, startAt, endAt] of [
      ["E2E cal A", "2026-11-10T09:00:00", "2026-11-10T10:00:00"],
      ["E2E cal B", "2026-11-10T11:00:00", "2026-11-10T12:00:00"],
      ["E2E cal C", "2026-11-10T13:00:00", "2026-11-10T14:00:00"],
      ["E2E cal D", "2026-11-10T15:00:00", "2026-11-11T09:00:00"],
    ]) {
      const response = await apiWithCsrf(page, "POST", "/api/schedules", {
        title,
        description: null,
        startAt,
        endAt,
        status: "PLANNED",
        priority: "NORMAL",
        assigneeId: null,
        location: null,
        isPublic: false,
        color: null,
      });
      expect(response.status).toBe(201);
    }

    await page.getByRole("link", { name: "일정 달력" }).click();
    await expect(page.getByRole("heading", { name: "일정 달력" })).toBeVisible();
    await page.goto("/schedule/calendar?date=2026-11-01");
    await expect(page.getByRole("heading", { name: "2026년 11월" })).toBeVisible();

    const nov10 = page.getByRole("region", { name: "2026년 11월 10일 (화)" });
    await expect(nov10.getByRole("link")).toHaveCount(3);
    await expect(page.getByRole("region", { name: "2026년 11월 11일 (수)" }).getByRole("link", { name: /\(계속\) E2E cal D/ })).toBeVisible();

    await nov10.getByRole("button", { name: /일정 1개 더 보기/ }).click();
    await expect(page.getByRole("heading", { name: "2026.11.08 – 11.14" })).toBeVisible();
    await expect(page.getByRole("region", { name: "2026년 11월 10일 (화)" }).getByRole("link")).toHaveCount(4);

    await page.getByRole("region", { name: "2026년 11월 10일 (화)" }).getByRole("link", { name: /E2E cal B/ }).click();
    await expect(page.getByRole("heading", { name: "E2E cal B" })).toBeVisible();
  });
});
