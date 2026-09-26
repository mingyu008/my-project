import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";

/**
 * TASK-09: React :3000 -> Spring :8080 in a real browser (real CORS, cookies, CSRF, sessions).
 * Accounts come from backend/src/main/resources/application-e2e.yml.
 */

const API = "http://localhost:8080";
const USER = { username: "e2e-user", password: "E2e-User-Password-1!" };
const ADMIN = { username: "e2e-admin", password: "E2e-Admin-Password-1!" };
const INACTIVE = { username: "e2e-inactive", password: "E2e-Inactive-Password-1!" };

const MSG = {
  authFailed: "아이디 또는 비밀번호가 올바르지 않습니다.",
  tooMany: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  forbidden: "이 화면에 접근할 권한이 없습니다.",
};

async function submitLogin(page: Page, { username, password }: { username: string; password: string }) {
  await page.getByLabel("아이디").fill(username);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
}

async function loginAs(page: Page, account: { username: string; password: string }) {
  await page.goto("/login");
  await submitLogin(page, account);
  await expect(page.getByText(`${account.username} 님으로 로그인했습니다.`)).toBeVisible();
}

/** fetch from the page's own origin, with the browser's cookies (as the React app would). */
async function apiFromPage(page: Page, path: string, init: RequestInit = {}) {
  return page.evaluate(
    async ([url, init]) => {
      const response = await fetch(url, { credentials: "include", ...init });
      return { status: response.status, body: await response.text() };
    },
    [`${API}${path}`, init] as const,
  );
}

async function sessionCookie(context: BrowserContext) {
  return (await context.cookies(API)).find((c) => c.name === "JSESSIONID");
}

test.describe("login flow", () => {
  test("csrf -> login -> me -> protected API -> AG Grid, with HttpOnly session cookie only", async ({ page, context }) => {
    const requests: { method: string; url: string; headers: Record<string, string> }[] = [];
    page.on("request", (r) => {
      if (r.url().startsWith(API)) requests.push({ method: r.method(), url: r.url(), headers: r.headers() });
    });
    const consoleMessages: string[] = [];
    page.on("console", (m) => consoleMessages.push(m.text()));

    await page.goto("/grid");
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();

    await submitLogin(page, USER);

    // Back to the originally requested page, AG Grid loaded through the API client.
    await expect(page.getByRole("heading", { name: "데이터 그리드" })).toBeVisible();
    await expect(page.getByText("Item 001")).toBeVisible();

    const calls = requests.map((r) => `${r.method} ${new URL(r.url).pathname}`);
    expect(calls).toEqual(
      expect.arrayContaining(["GET /api/auth/me", "GET /api/auth/csrf", "POST /api/auth/login", "GET /api/grid/data"]),
    );
    expect(calls.indexOf("GET /api/auth/csrf")).toBeLessThan(calls.indexOf("POST /api/auth/login"));
    expect(calls.lastIndexOf("GET /api/auth/me")).toBeGreaterThan(calls.indexOf("POST /api/auth/login"));

    const loginRequest = requests.find((r) => r.method === "POST" && r.url.endsWith("/api/auth/login"))!;
    expect(loginRequest.headers["x-xsrf-token"]).toBeTruthy();
    for (const r of requests) {
      expect(r.headers.authorization).toBeUndefined();
      expect(r.url.toLowerCase()).not.toContain("jsessionid");
    }

    const cookie = await sessionCookie(context);
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("Lax");

    // The app cannot read or store the session ID.
    const clientState = await page.evaluate(() => ({
      cookie: document.cookie,
      local: localStorage.length,
      session: sessionStorage.length,
    }));
    expect(clientState.cookie).not.toContain("JSESSIONID");
    expect(clientState.local).toBe(0);
    expect(clientState.session).toBe(0);

    const printed = consoleMessages.join("\n");
    expect(printed).not.toContain(USER.password);
    expect(printed).not.toContain(cookie!.value);
  });

  test("session ID changes on login (session fixation)", async ({ page, context }) => {
    await page.goto("/login");
    await apiFromPage(page, "/api/auth/csrf");
    const before = await sessionCookie(context);
    expect(before).toBeDefined();

    await submitLogin(page, USER);
    await expect(page.getByText(`${USER.username} 님으로 로그인했습니다.`)).toBeVisible();

    const after = await sessionCookie(context);
    expect(after!.value).not.toBe(before!.value);
  });

  test("session survives a page refresh", async ({ page }) => {
    await loginAs(page, USER);

    await page.reload();

    await expect(page.getByText(`${USER.username} 님으로 로그인했습니다.`)).toBeVisible();
    await expect(page.getByLabel("비밀번호")).toHaveCount(0);
  });

  test("wrong password, unknown user and inactive user get the same message", async ({ page }) => {
    await page.goto("/login");
    for (const attempt of [
      { username: USER.username, password: "Wrong-Password-1!" },
      { username: "e2e-does-not-exist", password: USER.password },
      INACTIVE,
    ]) {
      await submitLogin(page, attempt);
      await expect(page.getByRole("alert")).toHaveText(MSG.authFailed);
      await expect(page.getByLabel("비밀번호")).toHaveValue("");
    }
    expect((await apiFromPage(page, "/api/auth/me")).status).toBe(401);
  });

  test("repeated failures are rate limited", async ({ page }) => {
    await page.goto("/login");
    const target = { username: "e2e-rate-limit-target", password: "Wrong-Password-1!" };
    for (let i = 0; i < 5; i++) {
      await submitLogin(page, target);
      await expect(page.getByRole("alert")).toHaveText(MSG.authFailed);
    }

    await submitLogin(page, target);
    await expect(page.getByRole("alert")).toHaveText(MSG.tooMany);
  });
});

test.describe("authorization", () => {
  test("USER cannot reach admin screen or API", async ({ page }) => {
    await loginAs(page, USER);
    await expect(page.getByRole("link", { name: "사용자 관리" })).toHaveCount(0);

    await page.goto("/users");
    await expect(page.getByText(MSG.forbidden)).toBeVisible();

    const direct = await apiFromPage(page, "/api/users");
    expect(direct.status).toBe(403);
    expect(JSON.parse(direct.body).code).toBe("FORBIDDEN");
  });

  test("ADMIN can list users without password data", async ({ page }) => {
    const responses: string[] = [];
    page.on("response", async (r) => {
      if (r.url() === `${API}/api/users`) responses.push(await r.text());
    });
    await loginAs(page, ADMIN);

    await page.getByRole("link", { name: "사용자 관리" }).click();

    await expect(page.getByRole("cell", { name: USER.username, exact: true })).toBeVisible();
    expect(responses.join()).not.toMatch(/password|argon2/i);
  });
});

test.describe("session end", () => {
  test("logout invalidates the session; old cookie cannot be replayed; grid data is refused", async ({ page, context }) => {
    await loginAs(page, USER);
    const oldCookie = (await sessionCookie(context))!;

    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();

    expect((await apiFromPage(page, "/api/auth/me")).status).toBe(401);
    expect((await apiFromPage(page, "/api/grid/data")).status).toBe(401);

    await context.addCookies([oldCookie]);
    expect((await apiFromPage(page, "/api/auth/me")).status).toBe(401);

    await page.goto("/grid");
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  });

  test("losing the session while using the app returns to login", async ({ page, context }) => {
    await loginAs(page, USER);
    await context.clearCookies();

    await page.getByRole("link", { name: "데이터 그리드" }).click();

    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  });
});

test.describe("CSRF", () => {
  test("state-changing requests without a valid token are rejected", async ({ page }) => {
    await loginAs(page, USER);

    const missing = await apiFromPage(page, "/api/auth/logout", { method: "POST" });
    expect(missing.status).toBe(403);
    expect(JSON.parse(missing.body).code).toBe("CSRF_INVALID");

    const forged = await apiFromPage(page, "/api/auth/logout", { method: "POST", headers: { "X-XSRF-TOKEN": "forged" } });
    expect(forged.status).toBe(403);

    // Still logged in.
    expect((await apiFromPage(page, "/api/auth/me")).status).toBe(200);
  });
});

test.describe("CORS", () => {
  // A real server on another localhost port: a different origin but the same site, so the browser WOULD attach
  // the SameSite=Lax session cookie. It must be a real loopback server (not page.route), otherwise Chrome's
  // Local Network Access blocks the call first and the test would pass without CORS doing anything.
  const OTHER_ORIGIN_PORT = 3001;
  let otherOriginServer: Server;

  test.beforeAll(async () => {
    otherOriginServer = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body>other origin</body></html>");
    });
    await new Promise<void>((resolve) => otherOriginServer.listen(OTHER_ORIGIN_PORT, "localhost", resolve));
  });

  test.afterAll(async () => {
    await new Promise((resolve) => otherOriginServer.close(resolve));
  });

  test("a page on another origin cannot read the API with the user's cookies", async ({ page, context }) => {
    await loginAs(page, USER);
    const evil = await context.newPage();
    await evil.goto(`http://localhost:${OTHER_ORIGIN_PORT}/`);

    const result = await evil.evaluate(async (api) => {
      const attempt = async (init: RequestInit) => {
        try {
          const r = await fetch(`${api}/api/auth/me`, { credentials: "include", ...init });
          return `read:${r.status}`;
        } catch {
          return "blocked";
        }
      };
      return {
        get: await attempt({}),
        preflighted: await attempt({ method: "POST", headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": "x" } }),
      };
    }, API);

    expect(result).toEqual({ get: "blocked", preflighted: "blocked" });
  });
});
