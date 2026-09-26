import { Link } from "react-router-dom";
import { hasRole, useAuth } from "../auth/AuthContext";
import { LogoutButton } from "../auth/LogoutButton";

export function HomePage() {
  const { state } = useAuth();
  const user = state.user;

  return (
    <main>
      <h1>홈</h1>
      {user && <p>{user.loginIdentifier} 님으로 로그인했습니다.</p>}
      <LogoutButton />
      <nav>
        <ul>
          <li>
            <Link to="/grid">데이터 그리드</Link>
          </li>
          {/* Hidden for UX only; /api/users is ADMIN-only on the server. */}
          {hasRole(user, "ADMIN") && (
            <li>
              <Link to="/users">사용자 관리</Link>
            </li>
          )}
        </ul>
      </nav>
    </main>
  );
}
