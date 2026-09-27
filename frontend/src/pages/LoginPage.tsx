import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { LoadingScreen } from "./LoadingScreen";

// Mirrors server limits (User.LOGIN_IDENTIFIER_MAX_LENGTH, AuthService.PASSWORD_MAX_LENGTH).
export const LOGIN_IDENTIFIER_MAX_LENGTH = 100;
export const PASSWORD_MAX_LENGTH = 128;

export const MESSAGES = {
  identifierRequired: "아이디를 입력해 주세요.",
  identifierTooLong: `아이디는 ${LOGIN_IDENTIFIER_MAX_LENGTH}자 이하로 입력해 주세요.`,
  passwordRequired: "비밀번호를 입력해 주세요.",
  passwordTooLong: `비밀번호는 ${PASSWORD_MAX_LENGTH}자 이하로 입력해 주세요.`,
  authenticationFailed: "아이디 또는 비밀번호가 올바르지 않습니다.",
  tooManyAttempts: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  networkError: "서버에 연결할 수 없습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
  unknownError: "로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
} as const;

interface FieldErrors {
  username?: string;
  password?: string;
}

function validate(username: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!username.trim()) errors.username = MESSAGES.identifierRequired;
  else if (username.trim().length > LOGIN_IDENTIFIER_MAX_LENGTH) errors.username = MESSAGES.identifierTooLong;
  if (!password) errors.password = MESSAGES.passwordRequired;
  else if (password.length > PASSWORD_MAX_LENGTH) errors.password = MESSAGES.passwordTooLong;
  return errors;
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "AUTHENTICATION_FAILED") return MESSAGES.authenticationFailed;
    if (error.code === "TOO_MANY_ATTEMPTS") return MESSAGES.tooManyAttempts;
    if (error.code === "NETWORK_ERROR") return MESSAGES.networkError;
  }
  return MESSAGES.unknownError;
}

/**
 * Only same-app paths are accepted as the post-login destination (no "//host" or absolute URLs).
 */
export function safeRedirectPath(from: unknown): string {
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//") || from.startsWith("/\\")) {
    return "/";
  }
  if (from === "/login" || from.startsWith("/login?")) {
    return "/";
  }
  return from;
}

export function LoginPage() {
  const { state, login } = useAuth();
  const location = useLocation();
  const redirectTo = safeRedirectPath((location.state as { from?: unknown } | null)?.from);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const errors = validate(username, password);
    setFieldErrors(errors);
    setFormError(null);
    if (errors.username || errors.password) return;

    setSubmitting(true);
    try {
      await login({ username: username.trim(), password });
      // Auth state becomes "authenticated" and the <Navigate> below takes over.
      setPassword("");
    } catch (error) {
      // Never log the error together with credentials.
      setPassword("");
      setFormError(toMessage(error));
      setSubmitting(false);
    }
  }

  if (state.status === "loading") {
    return <LoadingScreen />;
  }
  if (state.status === "authenticated") {
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <main className="auth login">
      <h1>로그인</h1>
      <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        <div className="field">
          <label htmlFor="username">아이디</label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.username)}
            aria-describedby={fieldErrors.username ? "username-error" : undefined}
          />
          {fieldErrors.username && <p id="username-error" role="alert">{fieldErrors.username}</p>}
        </div>

        <div className="field">
          <label htmlFor="password">비밀번호</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? "password-error" : undefined}
          />
          {fieldErrors.password && <p id="password-error" role="alert">{fieldErrors.password}</p>}
        </div>

        {formError && <p role="alert">{formError}</p>}

        <button type="submit" className="block" disabled={submitting}>
          {submitting ? "로그인 중..." : "로그인"}
        </button>
      </form>
      <p className="center muted">
        계정이 없나요? <Link to="/signup">회원 가입</Link>
      </p>
    </main>
  );
}
