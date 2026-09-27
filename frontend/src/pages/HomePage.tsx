import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { LogoutButton } from "../auth/LogoutButton";
import { navItems } from "../layout/navItems";

export function HomePage() {
  const { state } = useAuth();
  const user = state.user;

  return (
    <main>
      <div className="page-header">
        <div>
          <h1>홈</h1>
          {user && <p className="muted">{user.loginIdentifier} 님으로 로그인했습니다.</p>}
        </div>
        <LogoutButton />
      </div>
      <nav aria-label="바로가기">
        {/* Admin items are hidden for UX only; the server authorizes every API call. */}
        <ul className="menu">
          {navItems(user).map((item) => (
            <li key={item.to}>
              <Link to={item.to}>{item.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
