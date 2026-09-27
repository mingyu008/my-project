import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { LogoutButton } from "../auth/LogoutButton";
import { navItems } from "./navItems";

/**
 * Top bar on every signed-in screen: home link and a collapsible menu (same on phone and desktop).
 * The menu starts closed and closes again on navigation or Escape.
 */
export function AppHeader() {
  const { state } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="app-header">
      <div className="app-header-bar">
        <Link to="/" className="app-brand">
          My Project
        </Link>
        <div className="app-header-right">
          {state.user && <span className="app-user">{state.user.loginIdentifier}</span>}
          <button
            type="button"
            className="secondary small menu-button"
            aria-expanded={open}
            aria-controls="app-menu"
            onClick={() => setOpen((o) => !o)}
          >
            <span aria-hidden="true">☰</span> 메뉴
          </button>
        </div>
      </div>
      <nav id="app-menu" className="app-menu" aria-label="주 메뉴" hidden={!open}>
        <ul>
          <li>
            <NavLink to="/" end>
              홈
            </NavLink>
          </li>
          {navItems(state.user).map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === "/schedule"}>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <LogoutButton />
      </nav>
    </header>
  );
}
