import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCsrfToken } from "../api/client";
import { AuthProvider } from "../auth/AuthContext";
import { SIGNUP_MESSAGES, TEST_MODE_MESSAGES } from "../auth/signupPolicy";
import { callsTo, CSRF_BODY, jsonResponse, routeFetch, type FetchRoute } from "../test/http";
import { HomePage } from "./HomePage";
import { TestLoginPage } from "./TestLoginPage";
import { TestSignupPage } from "./TestSignupPage";

const NO_SESSION: FetchRoute = ["GET", /\/api\/auth\/me$/, () => jsonResponse(401, { code: "UNAUTHENTICATED", message: "x" })];
const CSRF: FetchRoute = ["GET", /\/api\/auth\/csrf$/, () => jsonResponse(200, CSRF_BODY)];
const STUDENT = { id: 7, loginIdentifier: "kim.student", nickname: "김학생", roles: ["USER"] };

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<TestLoginPage />} />
          <Route path="/signup" element={<TestSignupPage />} />
          <Route path="/" element={<HomePage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

/** Answers availability checks from the given taken values. */
function availability(taken: string[]): FetchRoute {
  return [
    "GET",
    /\/api\/auth\/availability\?/,
    (url) => {
      const value = decodeURIComponent(url.split("=")[1]);
      return jsonResponse(200, { available: !taken.includes(value) });
    },
  ];
}

describe("TestLoginPage", () => {
  beforeEach(() => clearCsrfToken());
  afterEach(() => vi.unstubAllGlobals());

  it("asks only for the nickname", async () => {
    routeFetch([NO_SESSION]);
    renderAt("/login");

    expect(await screen.findByLabelText("닉네임")).toBeInTheDocument();
    expect(screen.queryByLabelText("비밀번호")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("아이디")).not.toBeInTheDocument();
  });

  it("validates the nickname without calling the API", async () => {
    const fetchMock = routeFetch([NO_SESSION]);
    const user = renderAt("/login");

    await user.click(await screen.findByRole("button", { name: "로그인" }));
    expect(screen.getByText(TEST_MODE_MESSAGES.nicknameRequired)).toBeInTheDocument();

    await user.type(screen.getByLabelText("닉네임"), "hong");
    await user.click(screen.getByRole("button", { name: "로그인" }));
    expect(screen.getByText(TEST_MODE_MESSAGES.nicknameInvalid)).toBeInTheDocument();
    expect(callsTo(fetchMock, "POST", /\/api\/auth\/login$/)).toHaveLength(0);
  });

  it("logs in with the nickname and greets by nickname", async () => {
    let loggedIn = false;
    const fetchMock = routeFetch([
      ["GET", /\/api\/auth\/me$/, () => (loggedIn ? jsonResponse(200, STUDENT) : jsonResponse(401, { code: "UNAUTHENTICATED" }))],
      CSRF,
      [
        "POST",
        /\/api\/auth\/login$/,
        () => {
          loggedIn = true;
          return jsonResponse(200, STUDENT);
        },
      ],
    ]);
    const user = renderAt("/login");

    await user.type(await screen.findByLabelText("닉네임"), " 김학생 ");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByText("김학생 님으로 로그인했습니다.")).toBeInTheDocument();
    const [login] = callsTo(fetchMock, "POST", /\/api\/auth\/login$/);
    expect(JSON.parse(login.init.body as string)).toEqual({ nickname: "김학생" });
  });

  it("shows a message for an unknown nickname", async () => {
    routeFetch([
      NO_SESSION,
      CSRF,
      ["POST", /\/api\/auth\/login$/, () => jsonResponse(401, { code: "AUTHENTICATION_FAILED", message: "x" })],
    ]);
    const user = renderAt("/login");

    await user.type(await screen.findByLabelText("닉네임"), "없는사람");
    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByText(TEST_MODE_MESSAGES.loginFailed)).toBeInTheDocument();
  });
});

describe("TestSignupPage", () => {
  beforeEach(() => clearCsrfToken());
  afterEach(() => vi.unstubAllGlobals());

  it("asks for ID and nickname only, each with a duplicate check", async () => {
    routeFetch([NO_SESSION]);
    renderAt("/signup");

    expect(await screen.findByLabelText("아이디")).toBeInTheDocument();
    expect(screen.getByLabelText("닉네임")).toBeInTheDocument();
    expect(screen.queryByLabelText("비밀번호")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "아이디 중복 확인" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "닉네임 중복 확인" })).toBeInTheDocument();
  });

  it("requires both duplicate checks before submitting", async () => {
    const fetchMock = routeFetch([NO_SESSION]);
    const user = renderAt("/signup");

    await user.type(await screen.findByLabelText("아이디"), "kim.student");
    await user.type(screen.getByLabelText("닉네임"), "김학생");
    await user.click(screen.getByRole("button", { name: "가입하기" }));

    expect(screen.getByText(TEST_MODE_MESSAGES.identifierNotChecked)).toBeInTheDocument();
    expect(screen.getByText(TEST_MODE_MESSAGES.nicknameNotChecked)).toBeInTheDocument();
    expect(callsTo(fetchMock, "POST", /\/api\/auth\/signup$/)).toHaveLength(0);
  });

  it("reports taken values and resets a check when the value changes", async () => {
    routeFetch([NO_SESSION, availability(["taken.id", "홍길동"])]);
    const user = renderAt("/signup");
    const username = await screen.findByLabelText("아이디");
    const nickname = screen.getByLabelText("닉네임");

    await user.type(username, "Taken.ID");
    await user.click(screen.getByRole("button", { name: "아이디 중복 확인" }));
    expect(await screen.findByText(SIGNUP_MESSAGES.identifierTaken)).toBeInTheDocument();

    await user.type(nickname, "홍길동");
    await user.click(screen.getByRole("button", { name: "닉네임 중복 확인" }));
    expect(await screen.findByText(TEST_MODE_MESSAGES.nicknameTaken)).toBeInTheDocument();

    await user.clear(nickname);
    await user.type(nickname, "김학생");
    expect(screen.queryByText(TEST_MODE_MESSAGES.nicknameTaken)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "닉네임 중복 확인" }));
    expect(await screen.findByText(TEST_MODE_MESSAGES.nicknameAvailable)).toBeInTheDocument();

    await user.type(nickname, "이");
    expect(screen.queryByText(TEST_MODE_MESSAGES.nicknameAvailable)).not.toBeInTheDocument();
  });

  it("validates format before checking", async () => {
    const fetchMock = routeFetch([NO_SESSION]);
    const user = renderAt("/signup");

    await user.type(await screen.findByLabelText("닉네임"), "hong");
    await user.click(screen.getByRole("button", { name: "닉네임 중복 확인" }));

    expect(screen.getByText(TEST_MODE_MESSAGES.nicknameInvalid)).toBeInTheDocument();
    expect(callsTo(fetchMock, "GET", /availability/)).toHaveLength(0);
  });

  it("signs up after both checks pass", async () => {
    const fetchMock = routeFetch([
      NO_SESSION,
      CSRF,
      availability([]),
      ["POST", /\/api\/auth\/signup$/, () => jsonResponse(201, { loginIdentifier: "kim.student", nickname: "김학생", status: "ACTIVE" })],
    ]);
    const user = renderAt("/signup");

    await user.type(await screen.findByLabelText("아이디"), " Kim.Student ");
    await user.click(screen.getByRole("button", { name: "아이디 중복 확인" }));
    expect(await screen.findByText(TEST_MODE_MESSAGES.identifierAvailable)).toBeInTheDocument();
    await user.type(screen.getByLabelText("닉네임"), "김학생");
    await user.click(screen.getByRole("button", { name: "닉네임 중복 확인" }));
    expect(await screen.findByText(TEST_MODE_MESSAGES.nicknameAvailable)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "가입하기" }));

    expect(await screen.findByText(TEST_MODE_MESSAGES.completed)).toBeInTheDocument();
    const [signup] = callsTo(fetchMock, "POST", /\/api\/auth\/signup$/);
    expect(JSON.parse(signup.init.body as string)).toEqual({ username: "kim.student", nickname: "김학생" });
    expect(callsTo(fetchMock, "GET", /availability\?username=kim\.student$/)).toHaveLength(1);
  });

  it("shows the server's duplicate error if someone took the nickname meanwhile", async () => {
    routeFetch([
      NO_SESSION,
      CSRF,
      availability([]),
      ["POST", /\/api\/auth\/signup$/, () => jsonResponse(409, { code: "NICKNAME_TAKEN", message: "x" })],
    ]);
    const user = renderAt("/signup");

    await user.type(await screen.findByLabelText("아이디"), "kim.student");
    await user.click(screen.getByRole("button", { name: "아이디 중복 확인" }));
    await user.type(screen.getByLabelText("닉네임"), "김학생");
    await user.click(screen.getByRole("button", { name: "닉네임 중복 확인" }));
    await screen.findByText(TEST_MODE_MESSAGES.nicknameAvailable);

    await user.click(screen.getByRole("button", { name: "가입하기" }));

    expect(await screen.findByText(TEST_MODE_MESSAGES.nicknameTaken)).toBeInTheDocument();
    expect(screen.queryByText(TEST_MODE_MESSAGES.nicknameAvailable)).not.toBeInTheDocument();
  });
});
