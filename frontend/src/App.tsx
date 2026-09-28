import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AUTH_TEST_MODE } from "./auth/authMode";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { HomePage } from "./pages/HomePage";
import { LoadingScreen } from "./pages/LoadingScreen";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { TestLoginPage } from "./pages/TestLoginPage";
import { TestSignupPage } from "./pages/TestSignupPage";
import { UsersPage } from "./pages/UsersPage";
import { PostDetailPage } from "./pages/board/PostDetailPage";
import { PostFormPage } from "./pages/board/PostFormPage";
import { PostListPage } from "./pages/board/PostListPage";
import { RewardsPage } from "./pages/reward/RewardsPage";
import { ScheduleCalendarPage } from "./pages/schedule/ScheduleCalendarPage";
import { ScheduleDetailPage } from "./pages/schedule/ScheduleDetailPage";
import { ScheduleFormPage } from "./pages/schedule/ScheduleFormPage";
import { StudyTimerPage } from "./pages/study/StudyTimerPage";

// AG Grid is large; load it only when a grid screen is opened.
const GridPage = lazy(() => import("./pages/GridPage").then((m) => ({ default: m.GridPage })));
const ScheduleListPage = lazy(() =>
  import("./pages/schedule/ScheduleListPage").then((m) => ({ default: m.ScheduleListPage })),
);

const protect = (element: ReactNode) => <ProtectedRoute>{element}</ProtectedRoute>;

export function App() {
  return (
    <Routes>
      <Route path="/login" element={AUTH_TEST_MODE ? <TestLoginPage /> : <LoginPage />} />
      <Route path="/signup" element={AUTH_TEST_MODE ? <TestSignupPage /> : <SignupPage />} />
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
        path="/schedule"
        element={protect(
          <Suspense fallback={<LoadingScreen />}>
            <ScheduleListPage />
          </Suspense>,
        )}
      />
      {/* Distinct keys: switching between new/edit must not reuse form state. */}
      <Route path="/schedule/calendar" element={protect(<ScheduleCalendarPage />)} />
      <Route path="/schedule/new" element={protect(<ScheduleFormPage key="new" />)} />
      <Route path="/schedule/:id" element={protect(<ScheduleDetailPage />)} />
      <Route path="/schedule/:id/edit" element={protect(<ScheduleFormPage key="edit" />)} />
      <Route path="/rewards" element={protect(<RewardsPage />)} />
      <Route path="/study" element={protect(<StudyTimerPage />)} />
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
