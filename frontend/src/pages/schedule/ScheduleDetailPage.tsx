import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { scheduleApi, type ScheduleDetail } from "../../api/scheduleApi";
import { formatDateTime } from "../board/boardMessages";
import { RewardSection } from "../reward/RewardSection";
import {
  formatLocalDateTime,
  PRIORITY_LABELS,
  safeColor,
  SCHEDULE_MESSAGES,
  scheduleErrorMessage,
  STATUS_LABELS,
} from "./scheduleMessages";

type LoadState = { status: "loading" } | { status: "loaded"; schedule: ScheduleDetail } | { status: "error"; message: string };

export function ScheduleDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isInteger(id) || id < 1) {
      setLoad({ status: "error", message: SCHEDULE_MESSAGES.notFound });
      return;
    }
    const controller = new AbortController();
    scheduleApi
      .get(id, controller.signal)
      .then((schedule) => setLoad({ status: "loaded", schedule }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        const message = scheduleErrorMessage(e);
        if (message) setLoad({ status: "error", message });
      });
    return () => controller.abort();
  }, [id]);

  async function handleDelete() {
    if (!window.confirm(SCHEDULE_MESSAGES.deleteConfirm)) return;
    setDeleting(true);
    setActionError(null);
    try {
      await scheduleApi.remove(id);
      navigate("/schedule", { replace: true });
    } catch (e) {
      setActionError(scheduleErrorMessage(e));
      setDeleting(false);
    }
  }

  return (
    <main className="narrow">
      <nav>
        <Link to="/schedule" className="back-link">
          목록으로
        </Link>
      </nav>
      {load.status === "loading" && <p role="status">{SCHEDULE_MESSAGES.loading}</p>}
      {load.status === "error" && <p role="alert">{load.message}</p>}
      {load.status === "loaded" && <ScheduleView schedule={load.schedule} />}
      {load.status === "loaded" && (
        <>
          {actionError && <p role="alert">{actionError}</p>}
          {/* Shown to the creator/ADMIN for UX; the server re-checks ownership. */}
          {load.schedule.editable && (
            <div className="post-actions">
              <Link to={`/schedule/${load.schedule.id}/edit`} className="btn secondary">
                수정
              </Link>
              <button type="button" className="danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          )}
          <RewardSection schedule={load.schedule} />
        </>
      )}
    </main>
  );
}

function ScheduleView({ schedule: s }: { schedule: ScheduleDetail }) {
  const color = safeColor(s.color);
  return (
    <article>
      <h1>
        {color && <span className="color-dot large" style={{ backgroundColor: color }} aria-hidden="true" />}
        {s.title}
      </h1>
      <p className="post-meta">
        <span className={`badge status-${s.status.toLowerCase()}`}>{STATUS_LABELS[s.status]}</span>{" "}
        <span className={`priority priority-${s.priority.toLowerCase()}`}>우선순위 {PRIORITY_LABELS[s.priority]}</span>
      </p>
      <dl className="detail-list">
        <dt>일시</dt>
        <dd>
          {formatLocalDateTime(s.startAt)} ~ {formatLocalDateTime(s.endAt)}
        </dd>
        <dt>담당자</dt>
        <dd>{s.assignee?.loginIdentifier ?? "-"}</dd>
        <dt>장소</dt>
        <dd>{s.location ?? "-"}</dd>
        <dt>공개 여부</dt>
        <dd>{s.isPublic ? "공개" : "비공개"}</dd>
        <dt>등록</dt>
        <dd>
          {s.createdBy.loginIdentifier} · {formatDateTime(s.createdAt)}
        </dd>
        <dt>수정</dt>
        <dd>
          {s.updatedBy.loginIdentifier} · {formatDateTime(s.updatedAt)}
        </dd>
      </dl>
      {/* Plain text only: React escapes it. Never render schedule text as HTML. */}
      <div data-testid="schedule-description" className="post-content">
        {s.description ?? ""}
      </div>
    </article>
  );
}
