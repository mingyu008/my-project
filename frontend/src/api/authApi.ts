import { apiClient, clearCsrfToken } from "./client";

export type Role = "USER" | "ADMIN";

export interface AuthUser {
  id: number;
  loginIdentifier: string;
  roles: Role[];
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export const authApi = {
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
