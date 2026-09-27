import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * TASK-10 (signup + admin approval) and TASK-11 (board) in a real browser against the real API.
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
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, account);
  return page;
}

/** State-changing API call from the page with a CSRF token, as the app's client does. */
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

test.describe("signup with admin approval", () => {
  test("new account cannot log in until an admin approves it", async ({ page, browser }) => {
    const newbie = { username: "e2e-newbie", password: "Newbie-Strong-Pass-9" };

    await page.goto("/login");
    await page.getByRole("link", { name: "회원 가입" }).click();
    await page.getByLabel("아이디").fill(newbie.username);
    await page.getByLabel("비밀번호", { exact: true }).fill(newbie.password);
    await page.getByLabel("비밀번호 확인").fill(newbie.password);
    await page.getByRole("button", { name: "가입 신청" }).click();
    await expect(page.getByText("가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.")).toBeVisible();

    // Same identifier again -> taken.
    await page.goto("/signup");
    await page.getByLabel("아이디").fill(newbie.username.toUpperCase());
    await page.getByLabel("비밀번호", { exact: true }).fill(newbie.password);
    await page.getByLabel("비밀번호 확인").fill(newbie.password);
    await page.getByRole("button", { name: "가입 신청" }).click();
    await expect(page.getByText("이미 사용 중인 아이디입니다.")).toBeVisible();

    // Pending: generic login failure.
    await page.goto("/login");
    await page.getByLabel("아이디").fill(newbie.username);
    await page.getByLabel("비밀번호").fill(newbie.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page.getByRole("alert")).toHaveText("아이디 또는 비밀번호가 올바르지 않습니다.");

    // A normal user cannot approve.
    const user = await newLoggedInPage(browser, USER);
    const denied = await apiWithCsrf(user, "POST", "/api/users/999/approve");
    expect(denied.status).toBe(403);

    // Admin approves in another browser context.
    const admin = await newLoggedInPage(browser, ADMIN);
    await admin.getByRole("link", { name: "사용자 관리" }).click();
    await admin.getByRole("button", { name: `${newbie.username} 승인` }).click();
    const row = admin.getByRole("row").filter({ hasText: newbie.username });
    await expect(row.getByRole("cell", { name: "활성" })).toBeVisible();

    await loginAs(page, newbie);
  });

  test("admin can reject a signup", async ({ page, browser }) => {
    const rejected = { username: "e2e-rejected", password: "Rejected-Strong-Pass-9" };
    await page.goto("/signup");
    await page.getByLabel("아이디").fill(rejected.username);
    await page.getByLabel("비밀번호", { exact: true }).fill(rejected.password);
    await page.getByLabel("비밀번호 확인").fill(rejected.password);
    await page.getByRole("button", { name: "가입 신청" }).click();
    await expect(page.getByRole("status")).toBeVisible();

    const admin = await newLoggedInPage(browser, ADMIN);
    admin.on("dialog", (dialog) => dialog.accept());
    await admin.goto("/users");
    await admin.getByRole("button", { name: `${rejected.username} 거절` }).click();
    await expect(admin.getByRole("cell", { name: rejected.username, exact: true })).toHaveCount(0);
  });
});

test.describe("board", () => {
  test("write, read as text, edit, permission checks, delete", async ({ page, browser }) => {
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.accept();
    });
    const xss = `<img src=x onerror="alert('xss')"><script>alert('xss2')</script>`;

    await loginAs(page, USER);
    await page.getByRole("link", { name: "게시판" }).click();
    await page.getByRole("link", { name: "글쓰기" }).click();
    await page.getByLabel("제목").fill("E2E first post");
    await page.getByLabel("내용").fill(`hello\n${xss}`);
    await page.getByRole("button", { name: "저장" }).click();

    // Detail: content shown as text, nothing executed.
    await expect(page.getByRole("heading", { name: "E2E first post" })).toBeVisible();
    await expect(page.getByTestId("post-content")).toHaveText(`hello\n${xss}`);
    expect(await page.getByTestId("post-content").locator("img, script").count()).toBe(0);
    const postUrl = page.url();
    const postId = Number(postUrl.split("/").pop());

    // Edit.
    await page.getByRole("link", { name: "수정" }).click();
    await page.getByLabel("제목").fill("E2E edited post");
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByRole("heading", { name: "E2E edited post" })).toBeVisible();

    // Another user: sees it, cannot change it (UI hides buttons, API refuses).
    const other = await newLoggedInPage(browser, USER2);
    await other.goto(`/posts/${postId}`);
    await expect(other.getByRole("heading", { name: "E2E edited post" })).toBeVisible();
    await expect(other.getByRole("link", { name: "수정" })).toHaveCount(0);
    await expect(other.getByRole("button", { name: "삭제" })).toHaveCount(0);
    expect((await apiWithCsrf(other, "PUT", `/api/posts/${postId}`, { title: "hijack", content: "x" })).status).toBe(403);
    expect((await apiWithCsrf(other, "DELETE", `/api/posts/${postId}`)).status).toBe(403);
    await other.goto(`/posts/${postId}/edit`);
    await expect(other.getByText("이 게시글을 수정하거나 삭제할 권한이 없습니다.")).toBeVisible();

    // Author deletes (confirm dialog).
    await page.getByRole("button", { name: "삭제" }).click();
    await expect(page.getByRole("heading", { name: "게시판" })).toBeVisible();
    await expect(page.getByRole("link", { name: "E2E edited post" })).toHaveCount(0);
    expect(dialogs).toEqual(["이 게시글을 삭제할까요?"]);
  });

  test("admin can delete someone else's post", async ({ page, browser }) => {
    await loginAs(page, USER2);
    const created = await apiWithCsrf(page, "POST", "/api/posts", { title: "Moderate me", content: "spam" });
    expect(created.status).toBe(201);
    const postId = JSON.parse(created.body).id as number;

    const admin = await newLoggedInPage(browser, ADMIN);
    admin.on("dialog", (dialog) => dialog.accept());
    await admin.goto(`/posts/${postId}`);
    await admin.getByRole("button", { name: "삭제" }).click();
    await expect(admin.getByRole("heading", { name: "게시판" })).toBeVisible();

    await page.goto(`/posts/${postId}`);
    await expect(page.getByText("게시글을 찾을 수 없습니다.")).toBeVisible();
  });

  test("list pages through posts, newest first", async ({ page }) => {
    await loginAs(page, USER);
    for (let i = 1; i <= 21; i++) {
      expect((await apiWithCsrf(page, "POST", "/api/posts", { title: `Paging ${i}`, content: "x" })).status).toBe(201);
    }

    await page.goto("/posts");
    await expect(page.getByRole("link", { name: "Paging 21" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Paging 2", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Paging 1", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "다음" }).click();
    await expect(page).toHaveURL(/\/posts\?page=2$/);
    await expect(page.getByRole("link", { name: "Paging 1", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "다음" })).toBeDisabled();
  });

  test("board requires login", async ({ page }) => {
    await page.goto("/posts");
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  });
});
