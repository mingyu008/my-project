import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * TASK-12 (schedule board) in a real browser against the real API.
 * Fixture accounts: backend/src/main/resources/application-e2e.yml.
 */

const API = "http://localhost:8080";
const USER = { username: "e2e-user", password: "E2e-User-Password-1!" };
const USER2 = { username: "e2e-user2", password: "E2e-User2-Password-1!" };
const ADMIN = { username: "e2e-admin", password: "E2e-Admin-Password-1!" };

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

async function fillSchedule(page: Page, title: string, assignee: string) {
  await page.getByLabel("제목 *").fill(title);
  await page.getByLabel("시작 일시 *").fill("2026-10-05T10:00");
  await page.getByLabel("종료 일시 *").fill("2026-10-05T11:00");
  await page.getByLabel("담당자").selectOption({ label: assignee });
}

test.describe("schedule board", () => {
  test("create with conflict warning, assignee read-only view, author delete", async ({ page, browser }) => {
    await loginAs(page, USER);
    await page.getByRole("link", { name: "일정관리" }).click();
    await expect(page.getByRole("heading", { name: "일정관리" })).toBeVisible();

    // First schedule for e2e-user2.
    await page.getByRole("link", { name: "새 일정" }).click();
    await fillSchedule(page, "E2E standup <b>bold</b>", USER2.username);
    await page.getByLabel("설명").fill("<script>window.__xss = 1</script>");
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByRole("heading", { name: "E2E standup <b>bold</b>" })).toBeVisible();
    await expect(page.getByTestId("schedule-description")).toHaveText("<script>window.__xss = 1</script>");
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    const firstUrl = page.url();
    const firstId = Number(firstUrl.split("/").pop());

    // Second schedule for the same assignee and time: warned, then saved on confirmation.
    await page.goto("/schedule/new");
    await fillSchedule(page, "E2E overlapping", USER2.username);
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByRole("alert", { name: "중복 일정 경고" })).toContainText("E2E standup");
    await page.getByRole("button", { name: "그래도 저장" }).click();
    await expect(page.getByRole("heading", { name: "E2E overlapping" })).toBeVisible();

    // End before start is refused in the form.
    await page.goto("/schedule/new");
    await page.getByLabel("시작 일시 *").fill("2026-10-05T10:00");
    await page.getByLabel("종료 일시 *").fill("2026-10-05T09:00");
    await expect(page.getByText("종료 일시는 시작 일시보다 빠를 수 없습니다.")).toBeVisible();

    // List + keyword search.
    await page.goto("/schedule");
    await page.getByLabel("검색어").fill("overlapping");
    await page.getByRole("button", { name: "검색" }).click();
    await expect(page.getByRole("link", { name: "E2E overlapping" })).toBeVisible();
    await expect(page.getByRole("link", { name: "E2E standup <b>bold</b>" })).toHaveCount(0);

    // The assignee sees it but cannot change it (UI and API).
    const user2 = await newLoggedInPage(browser, USER2);
    await user2.goto(`/schedule/${firstId}`);
    await expect(user2.getByRole("heading", { name: "E2E standup <b>bold</b>" })).toBeVisible();
    await expect(user2.getByRole("link", { name: "수정" })).toHaveCount(0);
    expect((await apiWithCsrf(user2, "DELETE", `/api/schedules/${firstId}`)).status).toBe(403);

    // The author deletes it; afterwards nobody finds it.
    page.once("dialog", (dialog) => dialog.accept());
    await page.goto(firstUrl);
    await page.getByRole("button", { name: "삭제" }).click();
    await expect(page.getByRole("heading", { name: "일정관리" })).toBeVisible();
    expect((await apiWithCsrf(user2, "GET", `/api/schedules/${firstId}`)).status).toBe(404);

    await user2.context().close();
  });

  test("private schedules are hidden from other users but visible to admins", async ({ page, browser }) => {
    await loginAs(page, USER);
    const created = await apiWithCsrf(page, "POST", "/api/schedules", {
      title: "E2E private",
      description: null,
      startAt: "2026-10-06T09:00:00",
      endAt: "2026-10-06T10:00:00",
      status: "PLANNED",
      priority: "LOW",
      assigneeId: null,
      location: null,
      isPublic: false,
      color: null,
    });
    expect(created.status).toBe(201);
    const id = JSON.parse(created.body).id as number;

    const user2 = await newLoggedInPage(browser, USER2);
    await user2.goto(`/schedule/${id}`);
    await expect(user2.getByText("일정을 찾을 수 없습니다.")).toBeVisible();

    const admin = await newLoggedInPage(browser, ADMIN);
    await admin.goto(`/schedule/${id}`);
    await expect(admin.getByRole("heading", { name: "E2E private" })).toBeVisible();
    await expect(admin.getByRole("link", { name: "수정" })).toBeVisible();

    await user2.context().close();
    await admin.context().close();
  });

  test("anonymous users are sent to login", async ({ page }) => {
    await page.goto("/schedule");
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  });
});
