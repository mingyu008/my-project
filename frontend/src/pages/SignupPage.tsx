import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { authApi } from "../api/authApi";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { normalizeLoginIdentifier, SIGNUP_MESSAGES, validateSignup, type SignupFieldErrors } from "../auth/signupPolicy";
import { LoadingScreen } from "./LoadingScreen";

function toErrors(error: unknown): { field?: SignupFieldErrors; form?: string } {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "LOGIN_IDENTIFIER_TAKEN":
        return { field: { username: SIGNUP_MESSAGES.identifierTaken } };
      case "INVALID_LOGIN_IDENTIFIER":
        return { field: { username: SIGNUP_MESSAGES.identifierInvalid } };
      case "INVALID_PASSWORD":
        return { field: { password: SIGNUP_MESSAGES.passwordTooSimple } };
      case "TOO_MANY_SIGNUPS":
        return { form: SIGNUP_MESSAGES.tooMany };
      case "NETWORK_ERROR":
        return { form: SIGNUP_MESSAGES.networkError };
    }
  }
  return { form: SIGNUP_MESSAGES.unknownError };
}

export function SignupPage() {
  const { state } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completedFor, setCompletedFor] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const errors = validateSignup(username, password, passwordConfirm);
    setFieldErrors(errors);
    setFormError(null);
    if (errors.username || errors.password || errors.passwordConfirm) return;

    setSubmitting(true);
    try {
      const result = await authApi.signup({ username: normalizeLoginIdentifier(username), password });
      setPassword("");
      setPasswordConfirm("");
      setCompletedFor(result.loginIdentifier);
    } catch (error) {
      const { field, form } = toErrors(error);
      setFieldErrors(field ?? {});
      setFormError(form ?? null);
    } finally {
      setSubmitting(false);
    }
  }

  if (state.status === "loading") {
    return <LoadingScreen />;
  }
  if (state.status === "authenticated") {
    return <Navigate to="/" replace />;
  }

  if (completedFor) {
    return (
      <main className="auth">
        <h1>회원 가입</h1>
        <p role="status" className="notice">
          {SIGNUP_MESSAGES.completed}
        </p>
        <p>신청한 아이디: {completedFor}</p>
        <Link to="/login" className="btn">
          로그인 화면으로
        </Link>
      </main>
    );
  }

  const field = (
    id: keyof SignupFieldErrors,
    label: string,
    type: string,
    value: string,
    onChange: (v: string) => void,
    autoComplete: string,
    hint?: string,
  ) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={submitting}
        aria-invalid={Boolean(fieldErrors[id])}
        aria-describedby={fieldErrors[id] ? `${id}-error` : hint ? `${id}-hint` : undefined}
      />
      {hint && !fieldErrors[id] && <p id={`${id}-hint`}>{hint}</p>}
      {fieldErrors[id] && (
        <p id={`${id}-error`} role="alert">
          {fieldErrors[id]}
        </p>
      )}
    </div>
  );

  return (
    <main className="auth">
      <h1>회원 가입</h1>
      <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        {field("username", "아이디", "text", username, setUsername, "username", "4~30자, 영문 소문자·숫자·'.'·'_'·'-'")}
        {field("password", "비밀번호", "password", password, setPassword, "new-password", "12자 이상")}
        {field("passwordConfirm", "비밀번호 확인", "password", passwordConfirm, setPasswordConfirm, "new-password")}

        {formError && <p role="alert">{formError}</p>}

        <button type="submit" className="block" disabled={submitting}>
          {submitting ? "가입 신청 중..." : "가입 신청"}
        </button>
      </form>
      <p className="center muted">
        이미 계정이 있나요? <Link to="/login">로그인</Link>
      </p>
    </main>
  );
}
