import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  SCHEDULE_STATUSES,
  scheduleApi,
  type CalendarResult,
  type ScheduleStatus,
  type ScheduleSummary,
  type UserRef,
} from "../../api/scheduleApi";
import {
  addDays,
  addMonths,
  dayLabel,
  isIsoDate,
  monthGrid,
  monthTitle,
  schedulesOn,
  startsOn,
  timeRange,
  timeOf,
  todayIso,
  WEEKDAY_LABELS,
  weekDays,
  weekTitle,
} from "./calendarUtils";
import { MOBILE_QUERY, useMediaQuery } from "../../layout/useMediaQuery";
import { safeColor, SCHEDULE_MESSAGES, scheduleErrorMessage, STATUS_LABELS } from "./scheduleMessages";

export const CALENDAR_MESSAGES = {
  loading: "일정을 불러오는 중...",
  error: "일정을 불러오지 못했습니다.",
  truncated: "일정이 너무 많아 일부만 표시합니다. 필터를 사용해 주세요.",
} as const;

/** Month cells show this many schedules, then "+N개 더". */
export const MONTH_CELL_LIMIT = 3;

type View = "month" | "week";
type LoadState = { status: "loading" } | { status: "loaded"; result: CalendarResult } | { status: "error"; message: string };

function isStatus(value: string | null): value is ScheduleStatus {
  return SCHEDULE_STATUSES.some((s) => s === value);
}

/**
 * Month (6 weeks, Sunday first) and week views of visible schedules. View, date and filters live in the URL.
 */
export function ScheduleCalendarPage() {
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const view: View = params.get("view") === "week" ? "week" : "month";
  const dateParam = params.get("date");
  const date = isIsoDate(dateParam) ? dateParam : today;
  const statusParam = params.get("status");
  const status = isStatus(statusParam) ? statusParam : undefined;
  const assigneeParam = Number(params.get("assigneeId"));
  const assigneeId = Number.isInteger(assigneeParam) && assigneeParam > 0 ? assigneeParam : undefined;

  const visibleDays = view === "month" ? monthGrid(date) : weekDays(date);
  const from = visibleDays[0];
  const to = visibleDays[visibleDays.length - 1];

  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [users, setUsers] = useState<UserRef[]>([]);
  const mobile = useMediaQuery(MOBILE_QUERY);

  useEffect(() => {
    const controller = new AbortController();
    scheduleApi.assignees(controller.signal).then(setUsers, () => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ status: "loading" });
    scheduleApi
      .calendar({ from, to, status, assigneeId }, controller.signal)
      .then((result) => setLoad({ status: "loaded", result }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        const message = scheduleErrorMessage(e);
        if (message)
          setLoad({ status: "error", message: message === SCHEDULE_MESSAGES.generic ? CALENDAR_MESSAGES.error : message });
      });
    return () => controller.abort();
  }, [from, to, status, assigneeId]);

  function update(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  }

  const move = (direction: -1 | 1) =>
    update({ date: view === "month" ? addMonths(date, direction) : addDays(date, 7 * direction) });

  const items = load.status === "loaded" ? load.result.items : [];
  const compact = mobile && view === "month";

  return (
    <main className="wide">
      <div className="page-header">
        <h1>일정 달력</h1>
        <nav className="actions">
          <Link to="/schedule" className="btn secondary">
            목록 보기
          </Link>
          <Link to="/schedule/new" className="btn">
            새 일정
          </Link>
        </nav>
      </div>

      <div className="calendar-toolbar">
        <div className="actions">
          <button
            type="button"
            className="secondary small"
            onClick={() => move(-1)}
            aria-label={view === "month" ? "이전 달" : "이전 주"}
          >
            ‹
          </button>
          <button type="button" className="secondary small" onClick={() => update({ date: undefined })}>
            오늘
          </button>
          <button
            type="button"
            className="secondary small"
            onClick={() => move(1)}
            aria-label={view === "month" ? "다음 달" : "다음 주"}
          >
            ›
          </button>
          <h2 className="calendar-title" aria-live="polite">
            {view === "month" ? monthTitle(date) : weekTitle(date)}
          </h2>
        </div>
        <div className="actions">
          <div className="segmented" role="group" aria-label="보기">
            <button type="button" aria-pressed={view === "month"} onClick={() => update({ view: undefined })}>
              월간
            </button>
            <button type="button" aria-pressed={view === "week"} onClick={() => update({ view: "week" })}>
              주간
            </button>
          </div>
          <div className="calendar-filters">
            <label htmlFor="calendar-status" className="inline-label">
              상태
            </label>
            <select id="calendar-status" value={status ?? ""} onChange={(e) => update({ status: e.target.value || undefined })}>
              <option value="">전체</option>
              {SCHEDULE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <label htmlFor="calendar-assignee" className="inline-label">
              담당자
            </label>
            <select
              id="calendar-assignee"
              value={assigneeId ?? ""}
              onChange={(e) => update({ assigneeId: e.target.value || undefined })}
            >
              <option value="">전체</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.loginIdentifier}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {load.status === "loading" && <p role="status">{CALENDAR_MESSAGES.loading}</p>}
      {load.status === "error" && <p role="alert">{load.message}</p>}
      {load.status === "loaded" && load.result.truncated && <p className="muted">{CALENDAR_MESSAGES.truncated}</p>}

      <div className={`calendar calendar-${view}`}>
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={label} className={`calendar-weekday${i === 0 ? " sunday" : i === 6 ? " saturday" : ""}`} aria-hidden="true">
            {label}
          </div>
        ))}
        {visibleDays.map((day) => {
          const daySchedules = schedulesOn(items, day);
          const shown = view === "month" ? daySchedules.slice(0, MONTH_CELL_LIMIT) : daySchedules;
          const hidden = daySchedules.length - shown.length;
          const classes = [
            "calendar-day",
            view === "month" && day.slice(0, 7) !== date.slice(0, 7) ? "outside" : "",
            day === today ? "today" : "",
          ].join(" ");
          if (compact) {
            // Phone month view: tap a day to list its schedules below the grid.
            return (
              <section key={day} className={`${classes} compact`} aria-label={dayLabel(day)} data-date={day}>
                <button
                  type="button"
                  className="calendar-day-button"
                  aria-pressed={day === date}
                  aria-label={`${dayLabel(day)} 일정 ${daySchedules.length}건`}
                  onClick={() => update({ date: day })}
                >
                  <span className="calendar-date">{Number(day.slice(8, 10))}</span>
                  <span className="calendar-dots" aria-hidden="true">
                    {daySchedules.slice(0, MONTH_CELL_LIMIT).map((s) => (
                      <span key={s.id} className={`calendar-dot status-${s.status.toLowerCase()}`} />
                    ))}
                    {daySchedules.length > MONTH_CELL_LIMIT && <span className="calendar-dot-more">+</span>}
                  </span>
                </button>
              </section>
            );
          }
          return (
            <section key={day} className={classes} aria-label={dayLabel(day)} data-date={day}>
              <div className="calendar-date">{Number(day.slice(8, 10))}</div>
              <ul>
                {shown.map((s) => (
                  <li key={s.id}>
                    <CalendarEvent schedule={s} day={day} detailed={view === "week"} />
                  </li>
                ))}
              </ul>
              {hidden > 0 && (
                <button
                  type="button"
                  className="calendar-more"
                  onClick={() => update({ view: "week", date: day })}
                  aria-label={`${dayLabel(day)} 일정 ${hidden}개 더 보기`}
                >
                  +{hidden}개 더
                </button>
              )}
            </section>
          );
        })}
      </div>

      {compact && (
        <section className="calendar-agenda" aria-labelledby="agenda-heading">
          <h2 id="agenda-heading">{dayLabel(date)} 일정</h2>
          {load.status === "loaded" && schedulesOn(items, date).length === 0 && <p className="muted">일정이 없습니다.</p>}
          <ul>
            {schedulesOn(items, date).map((s) => (
              <li key={s.id}>
                <CalendarEvent schedule={s} day={date} detailed />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function CalendarEvent({ schedule: s, day, detailed }: { schedule: ScheduleSummary; day: string; detailed: boolean }) {
  const color = safeColor(s.color);
  const starts = startsOn(s, day);
  const time = detailed ? timeRange(s, day) : starts ? timeOf(s.startAt) : "(계속)";
  const statusLabel = STATUS_LABELS[s.status];
  return (
    <Link
      to={`/schedule/${s.id}`}
      className={`calendar-event status-${s.status.toLowerCase()}`}
      title={`${s.title} · ${statusLabel}${s.assignee ? ` · ${s.assignee.loginIdentifier}` : ""}`}
    >
      {color && <span className="color-dot" style={{ backgroundColor: color }} aria-hidden="true" />}
      <span className="calendar-time">{time}</span> <span className="calendar-event-title">{s.title}</span>
      {/* Status is also given as text, never by color alone. */}
      {detailed ? (
        <span className="calendar-status">{statusLabel}</span>
      ) : (
        <>
          {" "}
          <span className="visually-hidden">({statusLabel})</span>
        </>
      )}
    </Link>
  );
}
