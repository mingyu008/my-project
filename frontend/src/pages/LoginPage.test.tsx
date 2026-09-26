import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { clearCsrfToken } from "../api/client";
import { AuthProvider } from "../auth/AuthContext";
import { CSRF_BODY, jsonResponse, mockFetch } from "../test/http";
import { MESSAGES } from "./LoginPage";

const USER = { id: 1, loginIdentifier: "alice", roles: ["USER"] };
const NO_SESSION = () => jsonResponse(401, { code: "UNAUTHENTICATED", message: "Authentication required" });
const AUTH_FAILED = { code: "AUTHENTICATION_FAILED", message: "Invalid login identifier or password" };

async function renderLogin() {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
  const username = (await screen.findByLabelText("아이디")) as HTMLInputElement;
  return {
    user: userEvent.setup(),
    username,
    password: screen.getByLabelText("비밀번호") as HTMLInputElement,
    submit: screen.getByRole("button", { name: "로그인" }),
  };
}

describe("LoginPage", () => {
  beforeEach(() => clearCsrfToken());
  afterEach(() => vi.unstubAllGlobals());

  it("uses a password input with proper autocomplete", async () => {
    mockFetch(NO_SESSION);
    const { username, password } = await renderLogin();

    expect(password.type).toBe("password");
    expect(password.autocomplete).toBe("current-password");
    expect(username.autocomplete).toBe("username");
  });

  it("validates required fields without calling the API", async () => {
    const fetchMock = mockFetch(NO_SESSION);
    const { user, submit } = await renderLogin();

    await user.click(submit);

    expect(screen.getByText(MESSAGES.identifierRequired)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.passwordRequired)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the initial session check
  });

  it("validates maximum lengths", async () => {
    const fetchMock = mockFetch(NO_SESSION);
    const { user, username, password, submit } = await renderLogin();

    await user.click(username);
    await user.paste("a".repeat(101));
    await user.click(password);
    await user.paste("p".repeat(129));
    await user.click(submit);

    expect(screen.getByText(MESSAGES.identifierTooLong)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.passwordTooLong)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the initial session check
  });

  it("shows loading state and blocks resubmission while signing in", async () => {
    let resolveLogin!: (response: Response) => void;
    const fetchMock = mockFetch(
      NO_SESSION,
      () => jsonResponse(200, CSRF_BODY),
      () => new Promise<Response>((resolve) => (resolveLogin = resolve)),
      () => jsonResponse(200, USER),
    );
    const { user, username, password } = await renderLogin();

    await user.type(username, "alice");
    await user.type(password, "pw");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    const loadingButton = await screen.findByRole("button", { name: "로그인 중..." });
    expect(loadingButton).toBeDisabled();
    expect(username).toBeDisabled();
    expect(password).toBeDisabled();

    await user.click(loadingButton);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    resolveLogin(jsonResponse(200, USER));
    expect(await screen.findByText("alice 님으로 로그인했습니다.")).toBeInTheDocument();
  });

  it("logs in, loads /api/auth/me and navigates home", async () => {
    const fetchMock = mockFetch(
      NO_SESSION,
      () => jsonResponse(200, CSRF_BODY),
      () => jsonResponse(200, USER),
      () => jsonResponse(200, USER),
    );
    const { user, username, password, submit } = await renderLogin();

    await user.type(username, "  alice ");
    await user.type(password, "Correct-Horse-9!");
    await user.click(submit);

    expect(await screen.findByText("alice 님으로 로그인했습니다.")).toBeInTheDocument();
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls[0]).toMatch(/\/api\/auth\/me$/); // initial session check
    expect(urls[1]).toMatch(/\/api\/auth\/csrf$/);
    expect(urls[2]).toMatch(/\/api\/auth\/login$/);
    expect(urls[3]).toMatch(/\/api\/auth\/me$/);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ username: "alice", password: "Correct-Horse-9!" });
  });

  it("shows a generic message and clears the password on authentication failure", async () => {
    mockFetch(NO_SESSION, () => jsonResponse(200, CSRF_BODY), () => jsonResponse(401, AUTH_FAILED));
    const { user, username, password, submit } = await renderLogin();

    await user.type(username, "alice");
    await user.type(password, "wrong");
    await user.click(submit);

    expect(await screen.findByText(MESSAGES.authenticationFailed)).toBeInTheDocument();
    expect(password.value).toBe("");
    expect(username.value).toBe("alice");
    expect(screen.getByRole("button", { name: "로그인" })).toBeEnabled();
  });

  it("shows a rate-limit message when the server returns 429", async () => {
    mockFetch(
      NO_SESSION,
      () => jsonResponse(200, CSRF_BODY),
      () => jsonResponse(429, { code: "TOO_MANY_ATTEMPTS", message: "Too many failed login attempts. Try again later." }),
    );
    const { user, username, password, submit } = await renderLogin();

    await user.type(username, "alice");
    await user.type(password, "pw");
    await user.click(submit);

    expect(await screen.findByText(MESSAGES.tooManyAttempts)).toBeInTheDocument();
    expect(password.value).toBe("");
  });

  it("shows a network error message", async () => {
    mockFetch(NO_SESSION, () => {
      throw new TypeError("Failed to fetch");
    });
    const { user, username, password, submit } = await renderLogin();

    await user.type(username, "alice");
    await user.type(password, "pw");
    await user.click(submit);

    expect(await screen.findByText(MESSAGES.networkError)).toBeInTheDocument();
  });

  it("shows a generic message for unexpected server errors", async () => {
    mockFetch(NO_SESSION, () => jsonResponse(200, CSRF_BODY), () => jsonResponse(500, { code: "INTERNAL", message: "stack trace..." }));
    const { user, username, password, submit } = await renderLogin();

    await user.type(username, "alice");
    await user.type(password, "pw");
    await user.click(submit);

    expect(await screen.findByText(MESSAGES.unknownError)).toBeInTheDocument();
    expect(screen.queryByText(/stack trace/)).not.toBeInTheDocument();
  });

  it("does not write credentials to the console or web storage", async () => {
    const consoleSpies = (["log", "info", "debug", "warn", "error"] as const).map((m) => vi.spyOn(console, m));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    mockFetch(
      NO_SESSION,
      () => jsonResponse(200, CSRF_BODY),
      () => jsonResponse(200, USER),
      () => jsonResponse(200, USER),
    );
    const { user, username, password, submit } = await renderLogin();

    await user.type(username, "alice");
    await user.type(password, "Secret-Password-1");
    await user.click(submit);
    await waitFor(() => expect(screen.getByText("alice 님으로 로그인했습니다.")).toBeInTheDocument());

    for (const spy of consoleSpies) {
      const printed = JSON.stringify(spy.mock.calls);
      expect(printed).not.toContain("Secret-Password-1");
      expect(printed).not.toContain(CSRF_BODY.token);
    }
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
  });
});
