import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { clearCsrfToken } from "../api/client";
import { AuthProvider } from "../auth/AuthContext";
import { SIGNUP_MESSAGES, validateSignup } from "../auth/signupPolicy";
import { CSRF_BODY, jsonResponse, mockFetch, requestAt } from "../test/http";

const NO_SESSION = () => jsonResponse(401, { code: "UNAUTHENTICATED", message: "Authentication required" });
const GOOD_PASSWORD = "Long-Enough-Pass-1";

async function renderSignup() {
  render(
    <MemoryRouter initialEntries={["/signup"]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
  const username = await screen.findByLabelText("아이디");
  return {
    user: userEvent.setup(),
    username,
    password: screen.getByLabelText("비밀번호"),
    confirm: screen.getByLabelText("비밀번호 확인"),
    submit: screen.getByRole("button", { name: "가입 신청" }),
  };
}

describe("validateSignup", () => {
  it("accepts a valid request", () => {
    expect(validateSignup("New.User", GOOD_PASSWORD, GOOD_PASSWORD)).toEqual({});
  });

  it.each([
    ["abc", "username"],
    ["has space", "username"],
    ["한글아이디", "username"],
  ])("rejects identifier %s", (username, field) => {
    expect(validateSignup(username, GOOD_PASSWORD, GOOD_PASSWORD)).toHaveProperty(field);
  });

  it("applies password rules", () => {
    expect(validateSignup("alice", "short", "short").password).toBe(SIGNUP_MESSAGES.passwordLength);
    expect(validateSignup("alice", "zzzzzzzzzzzzzz", "zzzzzzzzzzzzzz").password).toBe(SIGNUP_MESSAGES.passwordTooSimple);
    expect(validateSignup("alice", "my-ALICE-secret", "my-ALICE-secret").password).toBe(
      SIGNUP_MESSAGES.passwordContainsIdentifier,
    );
    expect(validateSignup("alice", GOOD_PASSWORD, "different").passwordConfirm).toBe(SIGNUP_MESSAGES.passwordMismatch);
  });
});

describe("SignupPage", () => {
  beforeEach(() => clearCsrfToken());
  afterEach(() => vi.unstubAllGlobals());

  it("is reachable from the login page", async () => {
    mockFetch(NO_SESSION);
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole("link", { name: "회원 가입" }));

    expect(screen.getByRole("heading", { name: "회원 가입" })).toBeInTheDocument();
  });

  it("validates locally without calling the API", async () => {
    const fetchMock = mockFetch(NO_SESSION);
    const { user, username, password, confirm, submit } = await renderSignup();

    await user.type(username, "ab");
    await user.type(password, "short");
    await user.type(confirm, "other");
    await user.click(submit);

    expect(screen.getByText(SIGNUP_MESSAGES.identifierInvalid)).toBeInTheDocument();
    expect(screen.getByText(SIGNUP_MESSAGES.passwordLength)).toBeInTheDocument();
    expect(screen.getByText(SIGNUP_MESSAGES.passwordMismatch)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // initial session check only
  });

  it("submits with CSRF and shows the pending-approval notice", async () => {
    const fetchMock = mockFetch(
      NO_SESSION,
      () => jsonResponse(200, CSRF_BODY),
      () => jsonResponse(201, { loginIdentifier: "new.user", status: "PENDING" }),
    );
    const { user, username, password, confirm, submit } = await renderSignup();

    await user.type(username, "  New.User ");
    await user.type(password, GOOD_PASSWORD);
    await user.type(confirm, GOOD_PASSWORD);
    await user.click(submit);

    expect(await screen.findByText(SIGNUP_MESSAGES.completed)).toBeInTheDocument();
    expect(screen.getByText("신청한 아이디: new.user")).toBeInTheDocument();
    const request = requestAt(fetchMock, 2);
    expect(request.url).toMatch(/\/api\/auth\/signup$/);
    expect(request.init.method).toBe("POST");
    expect(request.headers["X-XSRF-TOKEN"]).toBe(CSRF_BODY.token);
    expect(JSON.parse(request.init.body as string)).toEqual({ username: "new.user", password: GOOD_PASSWORD });
  });

  it.each([
    [409, "LOGIN_IDENTIFIER_TAKEN", SIGNUP_MESSAGES.identifierTaken],
    [429, "TOO_MANY_SIGNUPS", SIGNUP_MESSAGES.tooMany],
    [500, "INTERNAL", SIGNUP_MESSAGES.unknownError],
  ])("maps %s %s to a message", async (status, code, message) => {
    mockFetch(NO_SESSION, () => jsonResponse(200, CSRF_BODY), () => jsonResponse(status, { code, message: "server text" }));
    const { user, username, password, confirm, submit } = await renderSignup();

    await user.type(username, "someone");
    await user.type(password, GOOD_PASSWORD);
    await user.type(confirm, GOOD_PASSWORD);
    await user.click(submit);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText("server text")).not.toBeInTheDocument();
  });

  it("does not log or store the password", async () => {
    const consoleSpies = (["log", "info", "debug", "warn", "error"] as const).map((m) => vi.spyOn(console, m));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    mockFetch(
      NO_SESSION,
      () => jsonResponse(200, CSRF_BODY),
      () => jsonResponse(201, { loginIdentifier: "someone", status: "PENDING" }),
    );
    const { user, username, password, confirm, submit } = await renderSignup();

    await user.type(username, "someone");
    await user.type(password, GOOD_PASSWORD);
    await user.type(confirm, GOOD_PASSWORD);
    await user.click(submit);
    await screen.findByText(SIGNUP_MESSAGES.completed);

    for (const spy of consoleSpies) expect(JSON.stringify(spy.mock.calls)).not.toContain(GOOD_PASSWORD);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("redirects an authenticated user home", async () => {
    mockFetch(() => jsonResponse(200, { id: 1, loginIdentifier: "alice", roles: ["USER"] }));
    render(
      <MemoryRouter initialEntries={["/signup"]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("alice 님으로 로그인했습니다.")).toBeInTheDocument();
  });
});
