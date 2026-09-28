import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { authApi } from "../api/authApi";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import {
  LOGIN_IDENTIFIER_PATTERN,
  NICKNAME_PATTERN,
  normalizeLoginIdentifier,
  normalizeNickname,
  SIGNUP_MESSAGES,
  TEST_MODE_MESSAGES,
} from "../auth/signupPolicy";
import { LoadingScreen } from "./LoadingScreen";

type Field = "username" | "nickname";

/** Duplicate-check result, valid only for the exact (normalized) value that was checked. */
type Check = { value: string; state: "checking" | "available" | "taken" } | null;

const RULES: Record<Field, { normalize: (v: string) => string; pattern: RegExp; invalid: string }> = {
  username: { normalize: normalizeLoginIdentifier, pattern: LOGIN_IDENTIFIER_PATTERN, invalid: SIGNUP_MESSAGES.identifierInvalid },
  nickname: { normalize: normalizeNickname, pattern: NICKNAME_PATTERN, invalid: TEST_MODE_MESSAGES.nicknameInvalid },
};

const AVAILABLE: Record<Field, string> = {
  username: TEST_MODE_MESSAGES.identifierAvailable,
  nickname: TEST_MODE_MESSAGES.nicknameAvailable,
};
const TAKEN: Record<Field, string> = {
  username: SIGNUP_MESSAGES.identifierTaken,
  nickname: TEST_MODE_MESSAGES.nicknameTaken,
};
const NOT_CHECKED: Record<Field, string> = {
  username: TEST_MODE_MESSAGES.identifierNotChecked,
  nickname: TEST_MODE_MESSAGES.nicknameNotChecked,
};

function toErrors(error: unknown): { field?: Partial<Record<Field, string>>; form?: string } {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "LOGIN_IDENTIFIER_TAKEN":
        return { field: { username: SIGNUP_MESSAGES.identifierTaken } };
      case "NICKNAME_TAKEN":
        return { field: { nickname: TEST_MODE_MESSAGES.nicknameTaken } };
      case "INVALID_LOGIN_IDENTIFIER":
        return { field: { username: SIGNUP_MESSAGES.identifierInvalid } };
      case "INVALID_NICKNAME":
        return { field: { nickname: TEST_MODE_MESSAGES.nicknameInvalid } };
      case "SIGNUP_CONFLICT":
        return { form: TEST_MODE_MESSAGES.conflict };
      case "TOO_MANY_SIGNUPS":
        return { form: SIGNUP_MESSAGES.tooMany };
      case "NETWORK_ERROR":
        return { form: SIGNUP_MESSAGES.networkError };
    }
  }
  return { form: SIGNUP_MESSAGES.unknownError };
}

/**
 * Test-mode signup (auth/authMode.ts): ID + Hangul nickname, each with a duplicate check. No password;
 * the account is active at once and logs in with the nickname.
 */
export function TestSignupPage() {
  const { state } = useAuth();
  const [values, setValues] = useState<Record<Field, string>>({ username: "", nickname: "" });
  const [checks, setChecks] = useState<Record<Field, Check>>({ username: null, nickname: null });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState<{ loginIdentifier: string; nickname: string } | null>(null);

  /** The check counts only while the field still holds the value that was checked. */
  const checkOf = (field: Field): Check => {
    const check = checks[field];
    return check && check.value === RULES[field].normalize(values[field]) ? check : null;
  };

  function change(field: Field, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setFieldErrors((e) => ({ ...e, [field]: undefined }));
  }

  function validate(field: Field): string | null {
    const rule = RULES[field];
    return rule.pattern.test(rule.normalize(values[field])) ? null : rule.invalid;
  }

  async function check(field: Field) {
    const invalid = validate(field);
    setFieldErrors((e) => ({ ...e, [field]: invalid ?? undefined }));
    if (invalid) return;

    const value = RULES[field].normalize(values[field]);
    setChecks((c) => ({ ...c, [field]: { value, state: "checking" } }));
    try {
      const available = await authApi.isAvailable(field, value);
      setChecks((c) => ({ ...c, [field]: { value, state: available ? "available" : "taken" } }));
    } catch (error) {
      setChecks((c) => ({ ...c, [field]: null }));
      const { field: errors } = toErrors(error);
      setFieldErrors((e) => ({ ...e, [field]: errors?.[field] ?? TEST_MODE_MESSAGES.checkFailed }));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const errors: Partial<Record<Field, string>> = {};
    for (const field of ["username", "nickname"] as const) {
      const invalid = validate(field);
      const result = checkOf(field)?.state;
      if (invalid) errors[field] = invalid;
      else if (result === "taken") errors[field] = TAKEN[field];
      else if (result !== "available") errors[field] = NOT_CHECKED[field];
    }
    setFieldErrors(errors);
    setFormError(null);
    if (errors.username || errors.nickname) return;

    setSubmitting(true);
    try {
      const result = await authApi.signup({
        username: normalizeLoginIdentifier(values.username),
        nickname: normalizeNickname(values.nickname),
      });
      setCompleted({ loginIdentifier: result.loginIdentifier, nickname: result.nickname ?? normalizeNickname(values.nickname) });
    } catch (error) {
      const { field, form } = toErrors(error);
      setFieldErrors(field ?? {});
      setFormError(form ?? null);
      // A taken value invalidates its earlier "available" check.
      if (field) setChecks((c) => ({ username: field.username ? null : c.username, nickname: field.nickname ? null : c.nickname }));
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

  if (completed) {
    return (
      <main className="auth">
        <h1>회원 가입</h1>
        <p role="status" className="notice">
          {TEST_MODE_MESSAGES.completed}
        </p>
        <p>
          아이디: {completed.loginIdentifier}
          <br />
          닉네임: {completed.nickname}
        </p>
        <Link to="/login" className="btn">
          로그인하러 가기
        </Link>
      </main>
    );
  }

  const field = (id: Field, label: string, autoComplete: string, placeholder: string, hint: string) => {
    const checked = checkOf(id);
    const error = fieldErrors[id] ?? (checked?.state === "taken" ? TAKEN[id] : undefined);
    const ok = !error && checked?.state === "available";
    const describedBy = error ? `${id}-error` : ok ? `${id}-ok` : `${id}-hint`;
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <div className="input-with-button">
          <input
            id={id}
            name={id}
            type="text"
            autoComplete={autoComplete}
            placeholder={placeholder}
            value={values[id]}
            onChange={(e) => change(id, e.target.value)}
            disabled={submitting}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
          />
          <button
            type="button"
            className="secondary"
            onClick={() => check(id)}
            disabled={submitting || checked?.state === "checking"}
            aria-label={`${label} 중복 확인`}
          >
            {checked?.state === "checking" ? "확인 중..." : "중복 확인"}
          </button>
        </div>
        {error ? (
          <p id={`${id}-error`} role="alert">
            {error}
          </p>
        ) : ok ? (
          <p id={`${id}-ok`} role="status" className="ok">
            {AVAILABLE[id]}
          </p>
        ) : (
          <p id={`${id}-hint`}>{hint}</p>
        )}
      </div>
    );
  };

  return (
    <main className="auth">
      <h1>회원 가입</h1>
      <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        {field("username", "아이디", "username", "예: kim.student", TEST_MODE_MESSAGES.identifierHint)}
        {field("nickname", "닉네임", "nickname", "예: 홍길동", TEST_MODE_MESSAGES.nicknameHint)}

        {formError && <p role="alert">{formError}</p>}

        <button type="submit" className="block" disabled={submitting}>
          {submitting ? "가입 중..." : "가입하기"}
        </button>
      </form>
      <p className="center muted">
        이미 계정이 있나요? <Link to="/login">로그인</Link>
      </p>
    </main>
  );
}
