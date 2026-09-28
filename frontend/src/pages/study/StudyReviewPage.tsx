import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { isRewardManager, REWARD_MAX_POINTS, REWARD_MIN_POINTS, REWARD_REASON_MAX_LENGTH } from "../../api/rewardApi";
import { studyReviewApi, type StudentStudyDay, type StudyDayReview, type StudyDayRow, type StudyMode } from "../../api/studyApi";
import { useAuth } from "../../auth/AuthContext";
import { ForbiddenPage } from "../ForbiddenPage";
import { formatPoints, REWARD_MESSAGES, REWARD_STATUS_LABELS, rewardErrorMessage } from "../reward/rewardMessages";
import { formatClock, formatSpoken } from "./studyTime";

const MODE_LABELS: Record<StudyMode, string> = {
  STOPWATCH: "⏱ 스톱워치",
  POMODORO_FOCUS: "🍅 뽀모도로",
  MANUAL: "✍️ 직접 입력",
};

/** yyyy-MM-dd of today in Asia/Seoul. */
export function seoulToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function seoulTime(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(iso),
  );
}

const studentName = (s: StudyDayRow["student"]) => (s.nickname ? `${s.nickname} (${s.loginIdentifier})` : s.loginIdentifier);

type Load<T> = { status: "loading" } | { status: "loaded"; data: T } | { status: "error"; message: string };

/**
 * Reward managers (CONFIRMER / ADMIN) review each student's study day and reward it (TASK-TIMER-02).
 * Timer time (measured by the server) and hand-entered time (self-reported) are shown apart.
 * Rewards land in the normal reward list, where they are paid or cancelled.
 */
export function StudyReviewPage() {
  const { state } = useAuth();
  const manager = isRewardManager(state.user);
  const today = seoulToday();
  const [date, setDate] = useState(today);
  const [review, setReview] = useState<Load<StudyDayReview>>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [openDetail, setOpenDetail] = useState<number | null>(null);
  const [openReward, setOpenReward] = useState<number | null>(null);

  useEffect(() => {
    if (!manager) return;
    const controller = new AbortController();
    setReview({ status: "loading" });
    studyReviewApi
      .day(date, controller.signal)
      .then((data) => setReview({ status: "loaded", data }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        const message = rewardErrorMessage(e);
        if (message) setReview({ status: "error", message });
      });
    return () => controller.abort();
  }, [date, reloadKey, manager]);

  if (!manager) return <ForbiddenPage />;

  function changeDate(next: string) {
    if (!next || next > today) return;
    setDate(next);
    setOpenDetail(null);
    setOpenReward(null);
  }

  return (
    <main>
      <div className="page-header">
        <h1>공부 기록 확인</h1>
        <nav className="actions">
          <Link to="/rewards" className="btn secondary">
            보상 관리
          </Link>
        </nav>
      </div>

      <div className="review-date actions">
        <button type="button" className="secondary small" onClick={() => changeDate(shiftDay(date, -1))} aria-label="이전 날">
          ◀
        </button>
        <label htmlFor="review-date" className="visually-hidden">
          날짜
        </label>
        <input id="review-date" type="date" value={date} max={today} onChange={(e) => changeDate(e.target.value)} />
        <button
          type="button"
          className="secondary small"
          onClick={() => changeDate(shiftDay(date, 1))}
          disabled={date >= today}
          aria-label="다음 날"
        >
          ▶
        </button>
      </div>

      {review.status === "loading" && <p role="status">공부 기록을 불러오는 중...</p>}
      {review.status === "error" && <p role="alert">{review.message}</p>}
      {review.status === "loaded" && review.data.students.length === 0 && <p className="empty">이 날 공부한 학생이 없어요.</p>}
      {review.status === "loaded" && review.data.students.length > 0 && (
        <ul className="review-list" aria-label="학생별 공부 기록">
          {review.data.students.map((row) => (
            <li key={row.student.id} className="review-card">
              <div className="review-head">
                <strong>{studentName(row.student)}</strong>
                <span className="review-total study-mono">{formatClock(row.totalSec)}</span>
              </div>
              <p className="review-split">
                ⏱ 타이머 <span className="study-mono">{formatClock(row.timerSec)}</span> · ✍️ 직접 입력{" "}
                <span className="study-mono">{formatClock(row.manualSec)}</span> · {row.sessionCount}건
                {row.manualSec > row.timerSec && <span className="badge pending">직접 입력이 더 많아요</span>}
              </p>

              <div className="actions">
                <button
                  type="button"
                  className="secondary small"
                  aria-expanded={openDetail === row.student.id}
                  onClick={() => setOpenDetail(openDetail === row.student.id ? null : row.student.id)}
                >
                  {openDetail === row.student.id ? "기록 닫기" : "기록 보기"}
                </button>
                {row.reward ? (
                  <span className="review-reward">
                    🏆 {formatPoints(row.reward.points)} ·{" "}
                    <span className={`badge reward-${row.reward.status.toLowerCase()}`}>{REWARD_STATUS_LABELS[row.reward.status]}</span>
                  </span>
                ) : row.student.id === state.user?.id ? (
                  <span className="muted">본인 기록은 다른 확인자가 보상해요.</span>
                ) : (
                  <button
                    type="button"
                    className="small"
                    aria-expanded={openReward === row.student.id}
                    onClick={() => setOpenReward(openReward === row.student.id ? null : row.student.id)}
                  >
                    🏆 보상 주기
                  </button>
                )}
              </div>

              {openDetail === row.student.id && <StudentSessions userId={row.student.id} date={date} />}
              {openReward === row.student.id && !row.reward && (
                <RewardForm
                  row={row}
                  date={date}
                  onCancel={() => setOpenReward(null)}
                  onSaved={() => {
                    setOpenReward(null);
                    setReloadKey((k) => k + 1);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function StudentSessions({ userId, date }: { userId: number; date: string }) {
  const [day, setDay] = useState<Load<StudentStudyDay>>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    studyReviewApi
      .student(userId, date, controller.signal)
      .then((data) => setDay({ status: "loaded", data }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        const message = rewardErrorMessage(e);
        if (message) setDay({ status: "error", message });
      });
    return () => controller.abort();
  }, [userId, date]);

  if (day.status === "loading") return <p role="status">기록을 불러오는 중...</p>;
  if (day.status === "error") return <p role="alert">{day.message}</p>;
  return (
    <ul className="review-sessions" aria-label={`${day.data.student.loginIdentifier} 공부 기록`}>
      {day.data.sessions.map((s) => (
        <li key={s.id}>
          <span>{s.subjectName}</span>
          <span className="muted">{MODE_LABELS[s.mode]}</span>
          <span className="muted">{s.startTime ? `${seoulTime(s.startTime)}~${seoulTime(s.endTime)}` : "시각 없음"}</span>
          <span className="study-mono">{formatClock(s.durationSec)}</span>
        </li>
      ))}
    </ul>
  );
}

function RewardForm({ row, date, onCancel, onSaved }: { row: StudyDayRow; date: string; onCancel: () => void; onSaved: () => void }) {
  const [points, setPoints] = useState("100");
  const [reason, setReason] = useState(`${date.slice(5).replace("-", "/")} 공부 ${formatSpoken(row.totalSec)}`);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(points);
    if (!Number.isInteger(value) || value < REWARD_MIN_POINTS || value > REWARD_MAX_POINTS) {
      setError(REWARD_MESSAGES.pointsInvalid);
      return;
    }
    if (!reason.trim()) {
      setError(REWARD_MESSAGES.reasonRequired);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await studyReviewApi.reward(row.student.id, { date, points: value, reason: reason.trim() });
      onSaved();
    } catch (e) {
      setError(rewardErrorMessage(e));
      setSubmitting(false);
    }
  }

  const id = `reward-${row.student.id}`;
  return (
    <form className="reward-form" onSubmit={handleSubmit} noValidate aria-label={`${row.student.loginIdentifier} 보상`}>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${id}-points`}>포인트</label>
          <input
            id={`${id}-points`}
            type="number"
            inputMode="numeric"
            min={REWARD_MIN_POINTS}
            max={REWARD_MAX_POINTS}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-reason`}>사유</label>
          <input
            id={`${id}-reason`}
            maxLength={REWARD_REASON_MAX_LENGTH}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="actions">
        <button type="submit" disabled={submitting}>
          {submitting ? "저장 중..." : "보상 등록"}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
          취소
        </button>
      </div>
      <p className="muted">등록된 보상은 ‘보상 관리’에서 지급하거나 취소할 수 있어요.</p>
    </form>
  );
}
