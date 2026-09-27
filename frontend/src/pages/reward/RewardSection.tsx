import { useEffect, useState, type FormEvent } from "react";
import {
  isRewardManager,
  REWARD_MAX_POINTS,
  REWARD_MIN_POINTS,
  REWARD_REASON_MAX_LENGTH,
  rewardApi,
  type Reward,
  type RewardInput,
} from "../../api/rewardApi";
import { scheduleApi, type ScheduleDetail, type UserRef } from "../../api/scheduleApi";
import { useAuth } from "../../auth/AuthContext";
import { formatDateTime } from "../board/boardMessages";
import { formatPoints, REWARD_MESSAGES, REWARD_STATUS_LABELS, rewardErrorMessage } from "./rewardMessages";

type LoadState = { status: "loading" } | { status: "loaded"; items: Reward[]; canManage: boolean } | { status: "error"; message: string };

/** null = no form, "new" = add form, number = editing that reward. */
type Editing = null | "new" | number;

/**
 * Rewards of one schedule on its detail page. Reward managers see and manage all of them;
 * other users see only rewards they receive (the section is hidden when there are none).
 */
export function RewardSection({ schedule }: { schedule: ScheduleDetail }) {
  const { state } = useAuth();
  const manager = isRewardManager(state.user);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [users, setUsers] = useState<UserRef[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    rewardApi
      .forSchedule(schedule.id, controller.signal)
      .then((result) => setLoad({ status: "loaded", items: result.items, canManage: result.canManage }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        const message = rewardErrorMessage(e);
        if (message) setLoad({ status: "error", message });
      });
    if (manager) {
      scheduleApi.assignees(controller.signal).then(setUsers, () => undefined);
    }
    return () => controller.abort();
  }, [schedule.id, manager]);

  function replace(updated: Reward) {
    setLoad((s) => (s.status === "loaded" ? { ...s, items: s.items.map((r) => (r.id === updated.id ? updated : r)) } : s));
  }

  async function process(reward: Reward, action: "pay" | "cancel") {
    if (!window.confirm(action === "pay" ? REWARD_MESSAGES.payConfirm : REWARD_MESSAGES.cancelConfirm)) return;
    setBusyId(reward.id);
    setActionError(null);
    try {
      replace(action === "pay" ? await rewardApi.pay(reward.id) : await rewardApi.cancel(reward.id));
    } catch (e) {
      setActionError(rewardErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function save(input: RewardInput) {
    if (editing === "new") {
      const created = await rewardApi.create(schedule.id, input);
      setLoad((s) => (s.status === "loaded" ? { ...s, items: [...s.items, created] } : s));
    } else if (typeof editing === "number") {
      replace(await rewardApi.update(editing, input));
    }
    setEditing(null);
  }

  if (load.status === "loaded" && !manager && load.items.length === 0) return null;

  // A manager never rewards themselves (server rule), so they are not offered as recipient.
  const recipients = users.filter((u) => u.id !== state.user?.id);
  const editingReward = load.status === "loaded" && typeof editing === "number" ? load.items.find((r) => r.id === editing) : undefined;

  return (
    <section className="reward-section" aria-labelledby="reward-heading">
      <div className="section-header">
        <h2 id="reward-heading">보상</h2>
        {load.status === "loaded" && load.canManage && editing === null && (
          <button type="button" className="small" onClick={() => setEditing("new")}>
            보상 추가
          </button>
        )}
      </div>

      {load.status === "loading" && <p role="status">{REWARD_MESSAGES.loading}</p>}
      {load.status === "error" && <p role="alert">{load.message}</p>}
      {load.status === "loaded" && manager && !load.canManage && <p className="muted">{REWARD_MESSAGES.notCompleted}</p>}
      {actionError && <p role="alert">{actionError}</p>}

      {editing !== null && (
        <RewardForm
          key={String(editing)}
          recipients={recipients}
          initial={
            editingReward
              ? { recipientId: editingReward.recipient.id, points: editingReward.points, reason: editingReward.reason, version: editingReward.version }
              : { recipientId: schedule.assignee && schedule.assignee.id !== state.user?.id ? schedule.assignee.id : 0, points: 0, reason: "" }
          }
          submitLabel={editing === "new" ? "추가" : "수정 저장"}
          onSubmit={save}
          onCancel={() => setEditing(null)}
        />
      )}

      {load.status === "loaded" && load.items.length === 0 && <p className="muted">{REWARD_MESSAGES.empty}</p>}
      {load.status === "loaded" && load.items.length > 0 && (
        <div className="table-wrap">
          <table className="responsive">
            <thead>
              <tr>
                <th>수령자</th>
                <th>포인트</th>
                <th>사유</th>
                <th>상태</th>
                <th>처리</th>
              </tr>
            </thead>
            <tbody>
              {load.items.map((reward) => (
                <tr key={reward.id}>
                  <td data-label="수령자">{reward.recipient.loginIdentifier}</td>
                  <td data-label="포인트">{formatPoints(reward.points)}</td>
                  <td data-label="사유" className="grow">{reward.reason}</td>
                  <td data-label="상태">
                    <span className={`badge reward-${reward.status.toLowerCase()}`}>{REWARD_STATUS_LABELS[reward.status]}</span>
                  </td>
                  <td data-label="처리">
                    {reward.manageable ? (
                      <div className="actions">
                        <button
                          type="button"
                          className="small secondary"
                          onClick={() => setEditing(reward.id)}
                          disabled={busyId !== null || editing !== null}
                          aria-label={`${reward.recipient.loginIdentifier} 보상 수정`}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="small"
                          onClick={() => process(reward, "pay")}
                          disabled={busyId !== null}
                          aria-label={`${reward.recipient.loginIdentifier} 보상 지급`}
                        >
                          지급
                        </button>
                        <button
                          type="button"
                          className="small danger"
                          onClick={() => process(reward, "cancel")}
                          disabled={busyId !== null}
                          aria-label={`${reward.recipient.loginIdentifier} 보상 취소`}
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <span className="muted">{reward.paidAt ? `${formatDateTime(reward.paidAt)} 지급` : ""}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface FieldErrors {
  recipientId?: string;
  points?: string;
  reason?: string;
}

function RewardForm({
  recipients,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  recipients: UserRef[];
  initial: RewardInput;
  submitLabel: string;
  onSubmit: (input: RewardInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [recipientId, setRecipientId] = useState(initial.recipientId ? String(initial.recipientId) : "");
  const [points, setPoints] = useState(initial.points ? String(initial.points) : "");
  const [reason, setReason] = useState(initial.reason);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const errors: FieldErrors = {};
    const value = Number(points);
    if (!recipientId) errors.recipientId = REWARD_MESSAGES.recipientRequired;
    if (!Number.isInteger(value) || value < REWARD_MIN_POINTS || value > REWARD_MAX_POINTS) errors.points = REWARD_MESSAGES.pointsInvalid;
    if (!reason.trim()) errors.reason = REWARD_MESSAGES.reasonRequired;
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit({ recipientId: Number(recipientId), points: value, reason: reason.trim(), version: initial.version });
    } catch (e) {
      setFormError(rewardErrorMessage(e));
      setSubmitting(false);
    }
  }

  const describe = (id: keyof FieldErrors) => ({
    "aria-invalid": Boolean(fieldErrors[id]),
    "aria-describedby": fieldErrors[id] ? `reward-${id}-error` : undefined,
  });
  const error = (id: keyof FieldErrors) =>
    fieldErrors[id] && (
      <p id={`reward-${id}-error`} role="alert">
        {fieldErrors[id]}
      </p>
    );

  return (
    <form className="reward-form" onSubmit={handleSubmit} noValidate aria-busy={submitting} aria-label="보상 입력">
      <div className="field-row">
        <div className="field">
          <label htmlFor="reward-recipient">수령자 *</label>
          <select
            id="reward-recipient"
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            disabled={submitting}
            {...describe("recipientId")}
          >
            <option value="">선택</option>
            {recipients.map((u) => (
              <option key={u.id} value={u.id}>
                {u.loginIdentifier}
              </option>
            ))}
          </select>
          {error("recipientId")}
        </div>
        <div className="field">
          <label htmlFor="reward-points">포인트 *</label>
          <input
            id="reward-points"
            type="number"
            inputMode="numeric"
            min={REWARD_MIN_POINTS}
            max={REWARD_MAX_POINTS}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            disabled={submitting}
            {...describe("points")}
          />
          {error("points")}
        </div>
      </div>
      <div className="field">
        <label htmlFor="reward-reason">사유 *</label>
        <input
          id="reward-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={REWARD_REASON_MAX_LENGTH}
          disabled={submitting}
          {...describe("reason")}
        />
        {error("reason")}
      </div>
      {formError && <p role="alert">{formError}</p>}
      <div className="actions">
        <button type="submit" disabled={submitting}>
          {submitting ? "저장 중..." : submitLabel}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
          닫기
        </button>
      </div>
    </form>
  );
}
