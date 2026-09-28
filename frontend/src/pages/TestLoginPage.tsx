import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { NICKNAME_PATTERN, normalizeNickname, TEST_MODE_MESSAGES } from "../auth/signupPolicy";
import { LoadingScreen } from "./LoadingScreen";
import { MESSAGES, safeRedirectPath } from "./LoginPage";

function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "AUTHENTICATION_FAILED") return TEST_MODE_MESSAGES.loginFailed;
    if (error.code === "TOO_MANY_ATTEMPTS") return MESSAGES.tooManyAttempts;
    if (error.code === "NETWORK_ERROR") return MESSAGES.networkError;
  }
  return MESSAGES.unknownError;
}

/**
 * Test-mode login (auth/authMode.ts): the nickname alone signs the user in.
 */
export function TestLoginPage() {
  const { state, login } = useAuth();
  const location = useLocation();
  const redirectTo = safeRedirectPath((location.state as { from?: unknown } | null)?.from);
  const [nickname, setNickname] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const value = normalizeNickname(nickname);
    const error = !value
      ? TEST_MODE_MESSAGES.nicknameRequired
      : NICKNAME_PATTERN.test(value)
        ? null
        : TEST_MODE_MESSAGES.nicknameInvalid;
    setFieldError(error);
    setFormError(null);
    if (error) return;

    setSubmitting(true);
    try {
      await login({ nickname: value });
      // Auth state becomes "authenticated" and the <Navigate> below takes over.
    } catch (e) {
      setFormError(toMessage(e));
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
          <label htmlFor="nickname">닉네임</label>
          <input
            id="nickname"
            name="nickname"
            type="text"
            autoComplete="nickname"
            placeholder="예: 홍길동"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            disabled={submitting}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldError ? "nickname-error" : undefined}
          />
          {fieldError && (
            <p id="nickname-error" role="alert">
              {fieldError}
            </p>
          )}
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
