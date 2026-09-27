import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import {
  SCHEDULE_DESCRIPTION_MAX_LENGTH,
  SCHEDULE_LOCATION_MAX_LENGTH,
  SCHEDULE_PRIORITIES,
  SCHEDULE_STATUSES,
  SCHEDULE_TITLE_MAX_LENGTH,
  scheduleApi,
  type ConflictResult,
  type ScheduleInput,
  type SchedulePriority,
  type ScheduleStatus,
  type UserRef,
} from "../../api/scheduleApi";
import { hasRole, useAuth } from "../../auth/AuthContext";
import {
  allowedStatuses,
  COLOR_OPTIONS,
  formatLocalDateTime,
  PRIORITY_LABELS,
  SCHEDULE_MESSAGES,
  scheduleErrorMessage,
  STATUS_LABELS,
  toApiDateTime,
  toInputDateTime,
} from "./scheduleMessages";

interface FormState {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  status: ScheduleStatus;
  priority: SchedulePriority;
  assigneeId: string;
  location: string;
  isPublic: boolean;
  color: string;
}

type FieldErrors = Partial<Record<"title" | "startAt" | "endAt" | "status" | "assigneeId", string>>;

const EMPTY: FormState = {
  title: "",
  description: "",
  startAt: "",
  endAt: "",
  status: "PLANNED",
  priority: "NORMAL",
  assigneeId: "",
  location: "",
  isPublic: false,
  color: "",
};

/** datetime-local values ("yyyy-MM-ddTHH:mm") compare correctly as strings. */
function endBeforeStart(form: FormState): boolean {
  return Boolean(form.startAt && form.endAt && form.endAt < form.startAt);
}

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.title.trim()) errors.title = SCHEDULE_MESSAGES.titleRequired;
  else if (form.title.length > SCHEDULE_TITLE_MAX_LENGTH) errors.title = `제목은 ${SCHEDULE_TITLE_MAX_LENGTH}자 이하로 입력해 주세요.`;
  if (!form.startAt) errors.startAt = SCHEDULE_MESSAGES.startRequired;
  if (!form.endAt) errors.endAt = SCHEDULE_MESSAGES.endRequired;
  else if (endBeforeStart(form)) errors.endAt = SCHEDULE_MESSAGES.endBeforeStart;
  return errors;
}

function toInput(form: FormState, version?: number): ScheduleInput {
  return {
    title: form.title.trim(),
    description: form.description.trim() ? form.description : null,
    startAt: toApiDateTime(form.startAt),
    endAt: toApiDateTime(form.endAt),
    status: form.status,
    priority: form.priority,
    assigneeId: form.assigneeId ? Number(form.assigneeId) : null,
    location: form.location.trim() ? form.location : null,
    isPublic: form.isPublic,
    color: form.color || null,
    version,
  };
}

/** Server validation codes that belong to a single field. */
function toFieldError(error: unknown): FieldErrors | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === "INVALID_SCHEDULE_PERIOD") return { endAt: SCHEDULE_MESSAGES.endBeforeStart };
  if (error.code === "INVALID_ASSIGNEE") return { assigneeId: SCHEDULE_MESSAGES.assigneeInvalid };
  if (error.code === "INVALID_STATUS_TRANSITION") return { status: SCHEDULE_MESSAGES.statusTransition };
  return null;
}

/**
 * Create (/schedule/new) and edit (/schedule/:id/edit).
 * Overlapping schedules of the same assignee only produce a warning; the user may save anyway (FR-09).
 */
export function ScheduleFormPage() {
  const params = useParams();
  const editId = params.id === undefined ? null : Number(params.id);
  const navigate = useNavigate();
  const { state } = useAuth();
  const isAdmin = hasRole(state.user, "ADMIN");

  const [form, setForm] = useState<FormState>(EMPTY);
  const [version, setVersion] = useState<number | undefined>(undefined);
  const [originalStatus, setOriginalStatus] = useState<ScheduleStatus | null>(null);
  const [users, setUsers] = useState<UserRef[]>([]);
  const [loading, setLoading] = useState(editId !== null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [conflict, setConflict] = useState<ConflictResult | null>(null);
  /** assignee|start|end the user has already been warned about. */
  const [acknowledged, setAcknowledged] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    scheduleApi.assignees(controller.signal).then(setUsers, () => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (editId === null) return;
    if (!Number.isInteger(editId) || editId < 1) {
      setLoadError(SCHEDULE_MESSAGES.notFound);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    scheduleApi
      .get(editId, controller.signal)
      .then((s) => {
        if (!s.editable) {
          setLoadError(SCHEDULE_MESSAGES.forbidden);
        } else {
          setForm({
            title: s.title,
            description: s.description ?? "",
            startAt: toInputDateTime(s.startAt),
            endAt: toInputDateTime(s.endAt),
            status: s.status,
            priority: s.priority,
            assigneeId: s.assignee ? String(s.assignee.id) : "",
            location: s.location ?? "",
            isPublic: s.isPublic,
            color: s.color ?? "",
          });
          setVersion(s.version);
          setOriginalStatus(s.status);
        }
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(scheduleErrorMessage(e));
        setLoading(false);
      });
    return () => controller.abort();
  }, [editId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const errors = validate(form);
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const input = toInput(form, version);
      const conflictKey = `${form.assigneeId}|${input.startAt}|${input.endAt}`;
      if (input.assigneeId !== null && conflictKey !== acknowledged) {
        const result = await scheduleApi.conflicts({
          assigneeId: input.assigneeId,
          startAt: input.startAt,
          endAt: input.endAt,
          excludeId: editId ?? undefined,
        });
        if (result.conflict) {
          // Warn once; submitting again with the same assignee/time saves anyway.
          setConflict(result);
          setAcknowledged(conflictKey);
          setSubmitting(false);
          return;
        }
      }
      const saved = editId === null ? await scheduleApi.create(input) : await scheduleApi.update(editId, input);
      navigate(`/schedule/${saved.id}`, { replace: true });
    } catch (e) {
      const field = toFieldError(e);
      if (field) setFieldErrors(field);
      else setFormError(scheduleErrorMessage(e));
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (editId === null || !window.confirm(SCHEDULE_MESSAGES.deleteConfirm)) return;
    setDeleting(true);
    setFormError(null);
    try {
      await scheduleApi.remove(editId);
      navigate("/schedule", { replace: true });
    } catch (e) {
      setFormError(scheduleErrorMessage(e));
      setDeleting(false);
    }
  }

  const heading = editId === null ? "새 일정" : "일정 수정";
  const cancelTo = editId === null ? "/schedule" : `/schedule/${editId}`;

  if (loading) {
    return (
      <main className="narrow">
        <h1>{heading}</h1>
        <p role="status">{SCHEDULE_MESSAGES.loading}</p>
      </main>
    );
  }
  if (loadError) {
    return (
      <main className="narrow">
        <h1>{heading}</h1>
        <p role="alert">{loadError}</p>
        <Link to="/schedule">목록으로</Link>
      </main>
    );
  }

  const busy = submitting || deleting;
  const statusOptions = originalStatus && !isAdmin ? allowedStatuses(originalStatus) : [...SCHEDULE_STATUSES];
  // Shown as soon as both values are entered, before submit.
  const endError = fieldErrors.endAt ?? (endBeforeStart(form) ? SCHEDULE_MESSAGES.endBeforeStart : undefined);
  const conflictPending = conflict !== null && acknowledged === `${form.assigneeId}|${toApiDateTime(form.startAt)}|${toApiDateTime(form.endAt)}`;

  const errorProps = (id: keyof FieldErrors, message: string | undefined) => ({
    "aria-invalid": Boolean(message),
    "aria-describedby": message ? `${id}-error` : undefined,
  });
  const errorText = (id: keyof FieldErrors, message: string | undefined) =>
    message && (
      <p id={`${id}-error`} role="alert">
        {message}
      </p>
    );

  return (
    <main className="narrow">
      <h1>{heading}</h1>
      <form onSubmit={handleSubmit} noValidate aria-busy={busy}>
        <div className="field">
          <label htmlFor="title">제목 *</label>
          <input
            id="title"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            maxLength={SCHEDULE_TITLE_MAX_LENGTH}
            disabled={busy}
            {...errorProps("title", fieldErrors.title)}
          />
          {errorText("title", fieldErrors.title)}
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="startAt">시작 일시 *</label>
            <input
              id="startAt"
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => set("startAt", e.target.value)}
              disabled={busy}
              {...errorProps("startAt", fieldErrors.startAt)}
            />
            {errorText("startAt", fieldErrors.startAt)}
          </div>
          <div className="field">
            <label htmlFor="endAt">종료 일시 *</label>
            <input
              id="endAt"
              type="datetime-local"
              value={form.endAt}
              onChange={(e) => set("endAt", e.target.value)}
              disabled={busy}
              {...errorProps("endAt", endError)}
            />
            {errorText("endAt", endError)}
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="status">상태 *</label>
            <select
              id="status"
              value={form.status}
              onChange={(e) => set("status", e.target.value as ScheduleStatus)}
              disabled={busy}
              {...errorProps("status", fieldErrors.status)}
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            {errorText("status", fieldErrors.status)}
          </div>
          <div className="field">
            <label htmlFor="priority">우선순위 *</label>
            <select
              id="priority"
              value={form.priority}
              onChange={(e) => set("priority", e.target.value as SchedulePriority)}
              disabled={busy}
            >
              {SCHEDULE_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="assigneeId">담당자</label>
            <select
              id="assigneeId"
              value={form.assigneeId}
              onChange={(e) => set("assigneeId", e.target.value)}
              disabled={busy}
              {...errorProps("assigneeId", fieldErrors.assigneeId)}
            >
              <option value="">없음</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.loginIdentifier}
                </option>
              ))}
            </select>
            {errorText("assigneeId", fieldErrors.assigneeId)}
          </div>
          <div className="field">
            <label htmlFor="location">장소</label>
            <input
              id="location"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              maxLength={SCHEDULE_LOCATION_MAX_LENGTH}
              disabled={busy}
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="color">색상</label>
            <select id="color" value={form.color} onChange={(e) => set("color", e.target.value)} disabled={busy}>
              <option value="">없음</option>
              {COLOR_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field checkbox-field">
            <label>
              <input
                type="checkbox"
                checked={form.isPublic}
                onChange={(e) => set("isPublic", e.target.checked)}
                disabled={busy}
              />
              다른 사용자에게 공개
            </label>
          </div>
        </div>

        <div className="field">
          <label htmlFor="description">설명</label>
          <textarea
            id="description"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={SCHEDULE_DESCRIPTION_MAX_LENGTH}
            rows={6}
            disabled={busy}
          />
        </div>

        {conflictPending && conflict && (
          <div className="warning" role="alert" aria-label="중복 일정 경고">
            <p>같은 담당자에게 시간이 겹치는 일정이 있습니다. 그래도 저장하려면 다시 저장을 누르세요.</p>
            <ul>
              {conflict.items.map((item) => (
                <li key={item.id}>
                  {item.title} ({formatLocalDateTime(item.startAt)} ~ {formatLocalDateTime(item.endAt)})
                </li>
              ))}
              {conflict.hiddenCount > 0 && <li>볼 수 없는 일정 {conflict.hiddenCount}건</li>}
            </ul>
          </div>
        )}
        {formError && <p role="alert">{formError}</p>}

        <div className="actions">
          <button type="submit" disabled={busy}>
            {submitting ? "저장 중..." : conflictPending ? "그래도 저장" : "저장"}
          </button>
          <Link to={cancelTo} className="btn secondary">
            취소
          </Link>
          {editId !== null && (
            <button type="button" className="danger push-right" onClick={handleDelete} disabled={busy}>
              {deleting ? "삭제 중..." : "삭제"}
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
