import { apiClient, clearCsrfToken } from "./client";

export type Role = "USER" | "ADMIN" | "CONFIRMER";

export interface AuthUser {
  id: number;
  loginIdentifier: string;
  /** Test-mode login name; null (or absent) for accounts without one. */
  nickname?: string | null;
  roles: Role[];
}

/** Password login, or nickname-only login in test mode (auth/authMode.ts). */
export type LoginCredentials = { username: string; password: string } | { nickname: string };

/** Password signup, or ID + nickname signup in test mode. */
export type SignupRequest = { username: string; password: string } | { username: string; nickname: string };

export interface SignupResult {
  loginIdentifier: string;
  nickname?: string | null;
  /** PENDING until an ADMIN approves; ACTIVE at once in test mode. */
  status: "PENDING" | "ACTIVE";
}

export const authApi = {
  /**
   * Creates a PENDING account (it can log in only after an ADMIN approves it), or an ACTIVE one in test mode.
   */
  signup(request: SignupRequest): Promise<SignupResult> {
    return apiClient.post<SignupResult>("/api/auth/signup", request);
  },

  /**
   * Test mode only: whether the (already normalized) value is free. Invalid values reject with a 400 ApiError.
   */
  async isAvailable(field: "username" | "nickname", value: string, signal?: AbortSignal): Promise<boolean> {
    const result = await apiClient.get<{ available: boolean }>(
      `/api/auth/availability?${field}=${encodeURIComponent(value)}`,
      signal,
    );
    return result.available;
  },

  /**
   * The server changes the session ID and discards the CSRF token on success,
   * so the cached token is cleared and the next state-changing request fetches a new one.
   */
  async login(credentials: LoginCredentials): Promise<AuthUser> {
    const user = await apiClient.post<AuthUser>("/api/auth/login", credentials);
    clearCsrfToken();
    return user;
  },

  /**
   * Invalidates the server session. The CSRF token belonged to that session, so it is discarded too.
   */
  async logout(): Promise<void> {
    try {
      await apiClient.post<void>("/api/auth/logout");
    } finally {
      clearCsrfToken();
    }
  },

  me(signal?: AbortSignal): Promise<AuthUser> {
    return apiClient.get<AuthUser>("/api/auth/me", signal);
  },
};

/** Name shown for the signed-in user: the nickname when there is one. */
export function displayName(user: AuthUser): string {
  return user.nickname || user.loginIdentifier;
}
