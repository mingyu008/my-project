/**
 * Mirrors the server rules (SignupService.LOGIN_IDENTIFIER_PATTERN, PasswordPolicy) for immediate feedback.
 * The server remains the authority.
 */
export const LOGIN_IDENTIFIER_PATTERN = /^[a-z0-9._-]{4,30}$/;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const SIGNUP_MESSAGES = {
  identifierInvalid: "아이디는 4~30자의 영문 소문자, 숫자, '.', '_', '-'만 사용할 수 있습니다.",
  passwordLength: `비밀번호는 ${PASSWORD_MIN_LENGTH}~${PASSWORD_MAX_LENGTH}자로 입력해 주세요.`,
  passwordTooSimple: "비밀번호가 너무 단순합니다.",
  passwordContainsIdentifier: "비밀번호에 아이디를 포함할 수 없습니다.",
  passwordMismatch: "비밀번호가 일치하지 않습니다.",
  identifierTaken: "이미 사용 중인 아이디입니다.",
  tooMany: "가입 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  networkError: "서버에 연결할 수 없습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
  unknownError: "가입 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  completed: "가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.",
} as const;

export function normalizeLoginIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

export interface SignupFieldErrors {
  username?: string;
  password?: string;
  passwordConfirm?: string;
}

export function validateSignup(username: string, password: string, passwordConfirm: string): SignupFieldErrors {
  const errors: SignupFieldErrors = {};
  const id = normalizeLoginIdentifier(username);
  if (!LOGIN_IDENTIFIER_PATTERN.test(id)) {
    errors.username = SIGNUP_MESSAGES.identifierInvalid;
  }
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    errors.password = SIGNUP_MESSAGES.passwordLength;
  } else if (!password.trim() || new Set(password).size === 1) {
    errors.password = SIGNUP_MESSAGES.passwordTooSimple;
  } else if (id && password.toLowerCase().includes(id)) {
    errors.password = SIGNUP_MESSAGES.passwordContainsIdentifier;
  }
  if (password !== passwordConfirm) {
    errors.passwordConfirm = SIGNUP_MESSAGES.passwordMismatch;
  }
  return errors;
}
