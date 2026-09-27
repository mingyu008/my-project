import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCsrfToken } from "../api/client";
import { CSRF_BODY, jsonResponse, mockFetch, requestAt } from "../test/http";
import { USERS_MESSAGES, UsersPage } from "./UsersPage";

const ADMIN = { id: 1, loginIdentifier: "admin", status: "ACTIVE", roles: ["USER", "ADMIN"], createdAt: "2026-09-26T00:00:00Z" };
const PENDING = { id: 7, loginIdentifier: "newbie", status: "PENDING", roles: ["USER"], createdAt: "2026-09-26T00:00:00Z" };

function renderUsers() {
  render(
    <MemoryRouter>
      <UsersPage />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const rowOf = (name: string) => screen.getByRole("cell", { name }).closest("tr") as HTMLElement;

describe("UsersPage approval", () => {
  beforeEach(() => clearCsrfToken());
  afterEach(() => vi.unstubAllGlobals());

  it("shows pending signups with approve/reject only for them", async () => {
    mockFetch(() => jsonResponse(200, [ADMIN, PENDING]));
    renderUsers();

    await screen.findByText("승인 대기 1명");
    expect(within(rowOf("newbie")).getByText("승인 대기")).toBeInTheDocument();
    expect(within(rowOf("newbie")).getByRole("button", { name: "newbie 승인" })).toBeInTheDocument();
    expect(within(rowOf("admin")).queryByRole("button")).not.toBeInTheDocument();
  });

  it("approves with POST + CSRF and updates the row", async () => {
    const fetchMock = mockFetch(
      () => jsonResponse(200, [ADMIN, PENDING]),
      () => jsonResponse(200, CSRF_BODY),
      () => jsonResponse(200, { ...PENDING, status: "ACTIVE" }),
    );
    const user = renderUsers();

    await user.click(await screen.findByRole("button", { name: "newbie 승인" }));

    expect(await within(rowOf("newbie")).findByText("활성")).toBeInTheDocument();
    expect(within(rowOf("newbie")).queryByRole("button")).not.toBeInTheDocument();
    const request = requestAt(fetchMock, 2);
    expect(request.url).toMatch(/\/api\/users\/7\/approve$/);
    expect(request.init.method).toBe("POST");
    expect(request.headers["X-XSRF-TOKEN"]).toBe(CSRF_BODY.token);
  });

  it("rejects after confirmation and removes the row", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = mockFetch(
      () => jsonResponse(200, [ADMIN, PENDING]),
      () => jsonResponse(200, CSRF_BODY),
      () => new Response(null, { status: 204 }),
    );
    const user = renderUsers();

    await user.click(await screen.findByRole("button", { name: "newbie 거절" }));

    await screen.findByText("승인 대기 0명");
    expect(screen.queryByRole("cell", { name: "newbie" })).not.toBeInTheDocument();
    expect(requestAt(fetchMock, 2).url).toMatch(/\/api\/users\/7\/reject$/);
  });

  it("does nothing when rejection is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = mockFetch(() => jsonResponse(200, [ADMIN, PENDING]));
    const user = renderUsers();

    await user.click(await screen.findByRole("button", { name: "newbie 거절" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("cell", { name: "newbie" })).toBeInTheDocument();
  });

  it("shows an error when the server refuses the action", async () => {
    mockFetch(
      () => jsonResponse(200, [ADMIN, PENDING]),
      () => jsonResponse(200, CSRF_BODY),
      () => jsonResponse(409, { code: "USER_NOT_PENDING", message: "x" }),
    );
    const user = renderUsers();

    await user.click(await screen.findByRole("button", { name: "newbie 승인" }));

    expect(await screen.findByText(USERS_MESSAGES.actionFailed)).toBeInTheDocument();
  });
});
