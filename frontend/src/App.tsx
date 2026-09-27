import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { HomePage } from "./pages/HomePage";
import { LoadingScreen } from "./pages/LoadingScreen";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { UsersPage } from "./pages/UsersPage";
import { PostDetailPage } from "./pages/board/PostDetailPage";
import { PostFormPage } from "./pages/board/PostFormPage";
import { PostListPage } from "./pages/board/PostListPage";

// AG Grid is large; load it only when the grid screen is opened.
const GridPage = lazy(() => import("./pages/GridPage").then((m) => ({ default: m.GridPage })));

const protect = (element: ReactNode) => <ProtectedRoute>{element}</ProtectedRoute>;

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/" element={protect(<HomePage />)} />
      <Route
        path="/grid"
        element={protect(
          <Suspense fallback={<LoadingScreen />}>
            <GridPage />
          </Suspense>,
        )}
      />
      <Route path="/posts" element={protect(<PostListPage />)} />
      {/* Distinct keys: switching between new/edit must not reuse form state. */}
      <Route path="/posts/new" element={protect(<PostFormPage key="new" />)} />
      <Route path="/posts/:id" element={protect(<PostDetailPage />)} />
      <Route path="/posts/:id/edit" element={protect(<PostFormPage key="edit" />)} />
      <Route
        path="/users"
        element={
          <ProtectedRoute requiredRole="ADMIN">
            <UsersPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
