import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import type { Role } from "../api/authApi";
import { usersApi, type UserSummary } from "../api/usersApi";

export const USERS_MESSAGES = {
  loading: "사용자 목록을 불러오는 중...",
  forbidden: "사용자 목록을 조회할 권한이 없습니다.",
  generic: "사용자 목록을 불러오지 못했습니다.",
  actionFailed: "처리하지 못했습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.",
  actionForbidden: "이 작업을 수행할 권한이 없습니다.",
} as const;

const ROLE_LABELS: Record<Role, string> = {
  USER: "사용자",
  ADMIN: "관리자",
  CONFIRMER: "확인자",
};

const STATUS_LABELS: Record<UserSummary["status"], string> = {
  PENDING: "승인 대기",
  ACTIVE: "활성",
  INACTIVE: "비활성",
};

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; users: UserSummary[] }
  | { status: "error"; message: string };

export function UsersPage() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    usersApi
      .list(controller.signal)
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

  async function toggleConfirmer(user: UserSummary) {
    setBusyId(user.id);
    setActionError(null);
    try {
      const updated = await usersApi.setConfirmer(user.id, !user.roles.includes("CONFIRMER"));
      setLoad((s) => (s.status === "loaded" ? { ...s, users: s.users.map((u) => (u.id === updated.id ? updated : u)) } : s));
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        setActionError(e instanceof ApiError && e.status === 403 ? USERS_MESSAGES.actionForbidden : USERS_MESSAGES.actionFailed);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function runAction(user: UserSummary, action: "approve" | "reject") {
    if (action === "reject" && !window.confirm(`${user.loginIdentifier} 님의 가입 신청을 거절할까요?`)) return;
    setBusyId(user.id);
    setActionError(null);
    try {
      if (action === "approve") {
        const updated = await usersApi.approve(user.id);
        setLoad((s) => (s.status === "loaded" ? { ...s, users: s.users.map((u) => (u.id === updated.id ? updated : u)) } : s));
      } else {
        await usersApi.reject(user.id);
        setLoad((s) => (s.status === "loaded" ? { ...s, users: s.users.filter((u) => u.id !== user.id) } : s));
      }
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        setActionError(e instanceof ApiError && e.status === 403 ? USERS_MESSAGES.actionForbidden : USERS_MESSAGES.actionFailed);
      }
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = load.status === "loaded" ? load.users.filter((u) => u.status === "PENDING").length : 0;

  return (
    <main>
      <div className="page-header">
        <h1>사용자 관리</h1>
        <Link to="/" className="btn secondary">
          홈으로
        </Link>
      </div>
      {load.status === "loading" && <p role="status">{USERS_MESSAGES.loading}</p>}
      {load.status === "error" && <p role="alert">{load.message}</p>}
      {actionError && <p role="alert">{actionError}</p>}
      {load.status === "loaded" && (
        <>
          <p className="muted">승인 대기 {pendingCount}명</p>
          <div className="table-wrap">
          <table className="responsive">
            <thead>
              <tr>
                <th className="num">ID</th>
                <th>아이디</th>
                <th>상태</th>
                <th>권한</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {load.users.map((user) => (
                <tr key={user.id}>
                  <td data-label="ID" className="num">{user.id}</td>
                  <td data-label="아이디" className="grow">{user.loginIdentifier}</td>
                  <td data-label="상태">
                    <span className={`badge ${user.status.toLowerCase()}`}>{STATUS_LABELS[user.status]}</span>
                  </td>
                  <td data-label="권한">{user.roles.map((role) => ROLE_LABELS[role] ?? role).join(", ")}</td>
                  <td data-label="작업">
                    {user.status === "PENDING" && (
                      <div className="actions">
                        <button
                          type="button"
                          className="small"
                          onClick={() => runAction(user, "approve")}
                          disabled={busyId !== null}
                          aria-label={`${user.loginIdentifier} 승인`}
                        >
                          승인
                        </button>
                        <button
                          type="button"
                          className="small danger"
                          onClick={() => runAction(user, "reject")}
                          disabled={busyId !== null}
                          aria-label={`${user.loginIdentifier} 거절`}
                        >
                          거절
                        </button>
                      </div>
                    )}
                    {/* ADMIN already manages rewards; CONFIRMER is for active non-admin users. */}
                    {user.status === "ACTIVE" && !user.roles.includes("ADMIN") && (
                      <button
                        type="button"
                        className="small secondary"
                        onClick={() => toggleConfirmer(user)}
                        disabled={busyId !== null}
                        aria-label={`${user.loginIdentifier} ${user.roles.includes("CONFIRMER") ? "확인자 해제" : "확인자 지정"}`}
                      >
                        {user.roles.includes("CONFIRMER") ? "확인자 해제" : "확인자 지정"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </main>
  );
}
