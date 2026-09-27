import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { Role } from "../api/authApi";
import { AppHeader } from "../layout/AppHeader";
import { ForbiddenPage } from "../pages/ForbiddenPage";
import { LoadingScreen } from "../pages/LoadingScreen";
import { hasRole, useAuth } from "./AuthContext";

/**
 * UX guard only: hides screens the user cannot use. The server still authorizes every API call.
 */
export function ProtectedRoute({ children, requiredRole }: { children: ReactNode; requiredRole?: Role }) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "loading") {
    return <LoadingScreen />;
  }
  if (state.status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (requiredRole && !hasRole(state.user, requiredRole)) {
    return <ForbiddenPage />;
  }
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
