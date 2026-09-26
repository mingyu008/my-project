import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { clearCsrfToken } from "./api/client";
import { AuthProvider } from "./auth/AuthContext";
import { LOGOUT_ERROR_MESSAGE } from "./auth/LogoutButton";
import { USERS_MESSAGES } from "./pages/UsersPage";
import { FORBIDDEN_MESSAGE } from "./pages/ForbiddenPage";
import { CSRF_BODY, jsonResponse, mockFetch } from "./test/http";

const USER = { id: 1, loginIdentifier: "alice", roles: ["USER"] };
const ADMIN = { id: 2, loginIdentifier: "admin", roles: ["USER", "ADMIN"] };
const USERS = [
  { id: 1, loginIdentifier: "alice", status: "ACTIVE", roles: ["USER"], createdAt: "2026-09-26T00:00:00Z" },
  { id: 2, loginIdentifier: "admin", status: "ACTIVE", roles: ["USER", "ADMIN"], createdAt: "2026-09-26T00:00:00Z" },
];
const UNAUTHENTICATED = () => jsonResponse(401, { code: "UNAUTHENTICATED", message: "Authentication required" });

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

async function signIn(user: ReturnType<typeof userEvent.setup>, username: string) {
  await user.type(await screen.findByLabelText("아이디"), username);
  await user.type(screen.getByLabelText("비밀번호"), "pw");
  await user.click(screen.getByRole("button", { name: "로그인" }));
}

describe("App auth state and routing", () => {
  beforeEach(() => clearCsrfToken());
  afterEach(() => vi.unstubAllGlobals());

  it("shows a loading state while the session is being checked", async () => {
    let resolveMe!: (response: Response) => void;
    mockFetch(() => new Promise<Response>((resolve) => (resolveMe = resolve)));
    renderAt("/");

    expect(screen.getByRole("status")).toHaveTextContent("세션 확인 중...");

    resolveMe(jsonResponse(200, USER));
    expect(await screen.findByText("alice 님으로 로그인했습니다.")).toBeInTheDocument();
  });

  it("restores an existing session on app start (page refresh)", async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, USER));
    renderAt("/");

    expect(await screen.findByText("alice 님으로 로그인했습니다.")).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/auth\/me$/);
    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
  });

  it("redirects to login when there is no session", async () => {
    mockFetch(UNAUTHENTICATED);
    renderAt("/grid");

    expect(await screen.findByRole("heading", { name: "로그인" })).toBeInTheDocument();
  });

  it("treats a network failure on start as unauthenticated", async () => {
    mockFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    renderAt("/");

    expect(await screen.findByRole("heading", { name: "로그인" })).toBeInTheDocument();
  });

  it("returns to the originally requested page after login", async () => {
    mockFetch(
      UNAUTHENTICATED,
      () => jsonResponse(200, CSRF_BODY),
      () => jsonResponse(200, ADMIN),
      () => jsonResponse(200, ADMIN),
      () => jsonResponse(200, USERS),
    );
    const user = renderAt("/users");

    await signIn(user, "admin");

    expect(await screen.findByRole("heading", { name: "사용자 관리" })).toBeInTheDocument();
    expect(await screen.findByText("alice")).toBeInTheDocument();
  });

  it("redirects an authenticated user away from the login page", async () => {
    mockFetch(() => jsonResponse(200, USER));
    renderAt("/login");

    expect(await screen.findByText("alice 님으로 로그인했습니다.")).toBeInTheDocument();
  });

  it("shows the admin menu only to ADMIN (UX only)", async () => {
    mockFetch(() => jsonResponse(200, USER));
    renderAt("/");
    await screen.findByText("alice 님으로 로그인했습니다.");

    expect(screen.getByRole("link", { name: "데이터 그리드" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "사용자 관리" })).not.toBeInTheDocument();
  });

  it("shows the admin menu to ADMIN", async () => {
    mockFetch(() => jsonResponse(200, ADMIN));
    renderAt("/");

    expect(await screen.findByRole("link", { name: "사용자 관리" })).toBeInTheDocument();
  });

  it("blocks a non-admin from the users screen without calling the API", async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, USER));
    renderAt("/users");

    expect(await screen.findByText(FORBIDDEN_MESSAGE)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the server's 403 even if the UI allowed the screen", async () => {
    mockFetch(
      () => jsonResponse(200, ADMIN),
      () => jsonResponse(403, { code: "FORBIDDEN", message: "Access denied" }),
    );
    renderAt("/users");

    expect(await screen.findByText(USERS_MESSAGES.forbidden)).toBeInTheDocument();
  });

  it("logs out with POST + CSRF, clears auth state and returns to login", async () => {
    const fetchMock = mockFetch(
      () => jsonResponse(200, USER),
      () => jsonResponse(200, CSRF_BODY),
      () => new Response(null, { status: 204 }),
    );
    const user = renderAt("/");
    await screen.findByText("alice 님으로 로그인했습니다.");

    await user.click(screen.getByRole("button", { name: "로그아웃" }));

    expect(await screen.findByRole("heading", { name: "로그인" })).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(url).toMatch(/\/api\/auth\/logout$/);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>)["X-XSRF-TOKEN"]).toBe(CSRF_BODY.token);
    expect(screen.queryByText("alice 님으로 로그인했습니다.")).not.toBeInTheDocument();
  });

  it("keeps the user signed in and shows an error when logout fails on the network", async () => {
    mockFetch(
      () => jsonResponse(200, USER),
      () => jsonResponse(200, CSRF_BODY),
      () => {
        throw new TypeError("Failed to fetch");
      },
    );
    const user = renderAt("/");
    await screen.findByText("alice 님으로 로그인했습니다.");

    await user.click(screen.getByRole("button", { name: "로그아웃" }));

    expect(await screen.findByText(LOGOUT_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText("alice 님으로 로그인했습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeEnabled();
  });

  it("goes back to login when the session expires during use", async () => {
    mockFetch(() => jsonResponse(200, ADMIN), UNAUTHENTICATED);
    renderAt("/users");

    expect(await screen.findByRole("heading", { name: "로그인" })).toBeInTheDocument();
  });
});
