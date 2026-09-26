import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Role } from "../api/authApi";
import { ApiError, apiClient } from "../api/client";

interface UserSummary {
  id: number;
  loginIdentifier: string;
  status: "ACTIVE" | "INACTIVE";
  roles: Role[];
  createdAt: string;
}

export const USERS_MESSAGES = {
  loading: "사용자 목록을 불러오는 중...",
  forbidden: "사용자 목록을 조회할 권한이 없습니다.",
  generic: "사용자 목록을 불러오지 못했습니다.",
} as const;

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; users: UserSummary[] }
  | { status: "error"; message: string };

export function UsersPage() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    apiClient
      .get<UserSummary[]>("/api/users", controller.signal)
      .then((users) => setLoad({ status: "loaded", users }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        if (e instanceof ApiError && e.status === 401) return; // redirected to login globally
        setLoad({
          status: "error",
          message: e instanceof ApiError && e.status === 403 ? USERS_MESSAGES.forbidden : USERS_MESSAGES.generic,
        });
      });
    return () => controller.abort();
  }, []);

  return (
    <main>
      <h1>사용자 관리</h1>
      <Link to="/">홈으로</Link>
      {load.status === "loading" && <p role="status">{USERS_MESSAGES.loading}</p>}
      {load.status === "error" && <p role="alert">{load.message}</p>}
      {load.status === "loaded" && (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>아이디</th>
              <th>상태</th>
              <th>권한</th>
            </tr>
          </thead>
          <tbody>
            {load.users.map((user) => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td>{user.loginIdentifier}</td>
                <td>{user.status}</td>
                <td>{user.roles.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
