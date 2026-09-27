import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  isRewardManager,
  REWARD_STATUSES,
  rewardApi,
  type Reward,
  type RewardPage,
  type RewardStatus,
  type RewardSummary,
} from "../../api/rewardApi";
import { useAuth } from "../../auth/AuthContext";
import { formatDateTime } from "../board/boardMessages";
import { formatPoints, REWARD_MESSAGES, REWARD_STATUS_LABELS, rewardErrorMessage } from "./rewardMessages";

type Load<T> = { status: "loading" } | { status: "loaded"; data: T } | { status: "error"; message: string };

function isStatus(value: string | null): value is RewardStatus {
  return REWARD_STATUSES.some((s) => s === value);
}

/**
 * Point totals and reward history. Reward managers see everyone (and can pay/cancel);
 * other users see only their own rewards (enforced by the server).
 */
export function RewardsPage() {
  const { state } = useAuth();
  const manager = isRewardManager(state.user);
  const [params, setParams] = useSearchParams();
  const statusParam = params.get("status");
  const status = isStatus(statusParam) ? statusParam : undefined;
  const recipientParam = Number(params.get("recipientId"));
  const recipientId = manager && Number.isInteger(recipientParam) && recipientParam > 0 ? recipientParam : undefined;
  const pageParam = Number(params.get("page") ?? "1");
  const page = Number.isInteger(pageParam) && pageParam >= 1 ? pageParam - 1 : 0;

  const [summary, setSummary] = useState<Load<RewardSummary[]>>({ status: "loading" });
  const [list, setList] = useState<Load<RewardPage>>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    rewardApi
      .summary(controller.signal)
      .then((data) => setSummary({ status: "loaded", data }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        const message = rewardErrorMessage(e);
        if (message) setSummary({ status: "error", message });
      });
    return () => controller.abort();
  }, [reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    setList({ status: "loading" });
    rewardApi
      .list({ status, recipientId, page }, controller.signal)
      .then((data) => setList({ status: "loaded", data }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        const message = rewardErrorMessage(e);
        if (message) setList({ status: "error", message });
      });
    return () => controller.abort();
  }, [status, recipientId, page, reloadKey]);

  function setFilter(key: "status" | "recipientId", value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next);
  }

  function goTo(target: number) {
    const next = new URLSearchParams(params);
    if (target === 0) next.delete("page");
    else next.set("page", String(target + 1));
    setParams(next);
  }

  async function process(reward: Reward, action: "pay" | "cancel") {
    if (!window.confirm(action === "pay" ? REWARD_MESSAGES.payConfirm : REWARD_MESSAGES.cancelConfirm)) return;
    setBusyId(reward.id);
    setActionError(null);
    try {
      await (action === "pay" ? rewardApi.pay(reward.id) : rewardApi.cancel(reward.id));
      // Totals and filters may change: reload both.
      setReloadKey((k) => k + 1);
    } catch (e) {
      setActionError(rewardErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  const recipients = summary.status === "loaded" ? summary.data.map((s) => s.recipient) : [];

  return (
    <main>
      <div className="page-header">
        <h1>{manager ? "보상 관리" : "내 보상"}</h1>
        <nav className="actions">
          <Link to="/" className="btn secondary">
            홈으로
          </Link>
          <Link to="/schedule" className="btn secondary">
            일정관리
          </Link>
        </nav>
      </div>

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading">포인트 현황</h2>
        {summary.status === "loading" && <p role="status">{REWARD_MESSAGES.loading}</p>}
        {summary.status === "error" && <p role="alert">{summary.message}</p>}
        {summary.status === "loaded" && summary.data.length === 0 && <p className="muted">{REWARD_MESSAGES.empty}</p>}
        {summary.status === "loaded" && summary.data.length > 0 && (
          <div className="table-wrap">
            <table className="responsive" aria-label="포인트 현황">
              <thead>
                <tr>
                  <th>수령자</th>
                  <th>지급 대기</th>
                  <th>지급 완료</th>
                  <th>지급 건수</th>
                </tr>
              </thead>
              <tbody>
                {summary.data.map((s) => (
                  <tr key={s.recipient.id}>
                    <td data-label="수령자" className="grow">{s.recipient.loginIdentifier}</td>
                    <td data-label="지급 대기">{formatPoints(s.pendingPoints)}</td>
                    <td data-label="지급 완료">{formatPoints(s.paidPoints)}</td>
                    <td data-label="지급 건수">{s.paidCount}건</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="history-heading" className="spaced-section">
        <div className="section-header">
          <h2 id="history-heading">보상 내역</h2>
          <div className="actions filters">
            <label htmlFor="reward-status-filter" className="inline-label">
              상태
            </label>
            <select id="reward-status-filter" value={status ?? ""} onChange={(e) => setFilter("status", e.target.value)}>
              <option value="">전체</option>
              {REWARD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {REWARD_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            {manager && (
              <>
                <label htmlFor="reward-recipient-filter" className="inline-label">
                  수령자
                </label>
                <select
                  id="reward-recipient-filter"
                  value={recipientId ?? ""}
                  onChange={(e) => setFilter("recipientId", e.target.value)}
                >
                  <option value="">전체</option>
                  {recipients.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.loginIdentifier}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        {actionError && <p role="alert">{actionError}</p>}
        {list.status === "loading" && <p role="status">{REWARD_MESSAGES.loading}</p>}
        {list.status === "error" && <p role="alert">{list.message}</p>}
        {list.status === "loaded" && list.data.content.length === 0 && <p className="empty">{REWARD_MESSAGES.empty}</p>}
        {list.status === "loaded" && list.data.content.length > 0 && (
          <>
            <div className="table-wrap">
              <table className="responsive" aria-label="보상 내역">
                <thead>
                  <tr>
                    <th>일정</th>
                    <th>수령자</th>
                    <th>포인트</th>
                    <th>사유</th>
                    <th>상태</th>
                    <th>등록</th>
                    <th>처리</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.content.map((reward) => (
                    <tr key={reward.id}>
                      <td data-label="일정">
                        <Link to={`/schedule/${reward.scheduleId}`}>{reward.scheduleTitle}</Link>
                      </td>
                      <td data-label="수령자">{reward.recipient.loginIdentifier}</td>
                      <td data-label="포인트">{formatPoints(reward.points)}</td>
                      <td data-label="사유" className="grow">{reward.reason}</td>
                      <td data-label="상태">
                        <span className={`badge reward-${reward.status.toLowerCase()}`}>{REWARD_STATUS_LABELS[reward.status]}</span>
                      </td>
                      <td data-label="등록" className="muted">
                        {reward.createdBy.loginIdentifier} · {formatDateTime(reward.createdAt)}
                      </td>
                      <td data-label="처리">
                        {reward.manageable ? (
                          <div className="actions">
                            <button
                              type="button"
                              className="small"
                              onClick={() => process(reward, "pay")}
                              disabled={busyId !== null}
                              aria-label={`${reward.scheduleTitle} ${reward.recipient.loginIdentifier} 보상 지급`}
                            >
                              지급
                            </button>
                            <button
                              type="button"
                              className="small danger"
                              onClick={() => process(reward, "cancel")}
                              disabled={busyId !== null}
                              aria-label={`${reward.scheduleTitle} ${reward.recipient.loginIdentifier} 보상 취소`}
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <span className="muted">{reward.paidAt ? formatDateTime(reward.paidAt) : ""}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav aria-label="페이지" className="pagination">
              <button type="button" className="secondary small" onClick={() => goTo(page - 1)} disabled={page === 0}>
                이전
              </button>
              <span>
                {page + 1} / {Math.max(list.data.totalPages, 1)}
              </span>
              <button
                type="button"
                className="secondary small"
                onClick={() => goTo(page + 1)}
                disabled={page + 1 >= list.data.totalPages}
              >
                다음
              </button>
            </nav>
          </>
        )}
      </section>
    </main>
  );
}
