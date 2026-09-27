import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { clearCsrfToken } from "../api/client";
import { AuthProvider } from "../auth/AuthContext";
import { jsonResponse, routeFetch } from "../test/http";

function renderAt(path: string, roles = ["USER"]) {
  routeFetch([
    ["GET", /\/api\/auth\/me$/, () => jsonResponse(200, { id: 1, loginIdentifier: "alice", roles })],
    ["GET", /\/api\/posts\?/, () => jsonResponse(200, { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 })],
  ]);
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe("AppHeader", () => {
  beforeEach(() => clearCsrfToken());
  afterEach(() => vi.unstubAllGlobals());

  it("starts with the menu closed and opens it on demand", async () => {
    const user = renderAt("/");
    const toggle = await screen.findByRole("button", { name: /메뉴/ });

    expect(screen.getByRole("link", { name: "My Project" })).toHaveAttribute("href", "/");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "주 메뉴" })).not.toBeInTheDocument();

    await user.click(toggle);

    const menu = screen.getByRole("navigation", { name: "주 메뉴" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(menu).getByRole("link", { name: "일정 달력" })).toHaveAttribute("href", "/schedule/calendar");
    expect(within(menu).getByRole("link", { name: "내 보상" })).toBeInTheDocument();
    expect(within(menu).queryByRole("link", { name: "사용자 관리" })).not.toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  });

  it("closes after navigating and on Escape", async () => {
    const user = renderAt("/");
    await user.click(await screen.findByRole("button", { name: /메뉴/ }));

    await user.click(within(screen.getByRole("navigation", { name: "주 메뉴" })).getByRole("link", { name: "게시판" }));

    expect(await screen.findByRole("heading", { name: "게시판" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "주 메뉴" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /메뉴/ }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("navigation", { name: "주 메뉴" })).not.toBeInTheDocument();
  });

  it("lists admin screens for ADMIN and names rewards for managers", async () => {
    const user = renderAt("/", ["USER", "ADMIN"]);
    await user.click(await screen.findByRole("button", { name: /메뉴/ }));

    const menu = screen.getByRole("navigation", { name: "주 메뉴" });
    expect(within(menu).getByRole("link", { name: "사용자 관리" })).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "보상 관리" })).toBeInTheDocument();
  });

  it("is not shown on the login screen", async () => {
    routeFetch([["GET", /\/api\/auth\/me$/, () => jsonResponse(401, { code: "UNAUTHENTICATED", message: "x" })]]);
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "로그인" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /메뉴/ })).not.toBeInTheDocument();
  });
});
