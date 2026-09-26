import { useState } from "react";
import { useAuth } from "./AuthContext";

export const LOGOUT_ERROR_MESSAGE = "로그아웃하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.";

/**
 * After a successful logout the auth state becomes unauthenticated and ProtectedRoute sends the user to /login.
 */
export function LogoutButton() {
  const { logout } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      await logout();
    } catch {
      setError(LOGOUT_ERROR_MESSAGE);
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" onClick={handleClick} disabled={pending}>
        {pending ? "로그아웃 중..." : "로그아웃"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
