import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi, type AuthUser, type LoginCredentials, type Role } from "../api/authApi";
import { ApiError, onUnauthorized } from "../api/client";

/**
 * Auth state lives only in React memory. The session itself is the HttpOnly cookie managed by the browser;
 * after a page refresh the state is restored by asking the server (GET /api/auth/me).
 *
 * This state drives UX only. Spring Security is the actual security boundary.
 */
export type AuthState =
  | { status: "loading"; user: null }
  | { status: "unauthenticated"; user: null }
  | { status: "authenticated"; user: AuthUser };

interface AuthContextValue {
  state: AuthState;
  login: (credentials: LoginCredentials) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const LOADING: AuthState = { status: "loading", user: null };
const UNAUTHENTICATED: AuthState = { status: "unauthenticated", user: null };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(LOADING);

  // Session expired or missing on any API call -> unauthenticated (ProtectedRoute redirects to login).
  useEffect(() => onUnauthorized(() => setState(UNAUTHENTICATED)), []);

  // Restore the session on app start.
  useEffect(() => {
    const controller = new AbortController();
    authApi
      .me(controller.signal)
      .then((user) => setState({ status: "authenticated", user }))
      .catch(() => {
        if (!controller.signal.aborted) setState(UNAUTHENTICATED);
      });
    return () => controller.abort();
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    await authApi.login(credentials);
    // Confirm the session cookie was accepted and read the canonical user from the server.
    const user = await authApi.me();
    setState({ status: "authenticated", user });
    return user;
  }, []);

  /**
   * Logged out only once the server confirms (204) or reports no session (401).
   * On other failures (e.g. network) the session may still be alive, so the state is kept and the error rethrown.
   */
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
    setState(UNAUTHENTICATED);
  }, []);

  const value = useMemo(() => ({ state, login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function hasRole(user: AuthUser | null, role: Role): boolean {
  return user?.roles.includes(role) ?? false;
}
