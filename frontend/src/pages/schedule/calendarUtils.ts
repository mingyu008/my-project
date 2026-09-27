import type { ScheduleSummary } from "../../api/scheduleApi";

/**
 * Calendar date math on "yyyy-MM-dd" strings. Dates are handled as UTC midnights internally so the
 * browser time zone never shifts a day (schedule times are zone-less wall-clock values, D-030).
 */

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isIsoDate(value: string | null): value is string {
  return value !== null && ISO_DATE.test(value) && fromUtc(toUtc(value)) === value;
}

/** Today in the browser's local calendar. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

export function addMonths(iso: string, months: number): string {
  const date = toUtc(iso.slice(0, 8) + "01");
  date.setUTCMonth(date.getUTCMonth() + months);
  return fromUtc(date);
}

export function weekday(iso: string): number {
  return toUtc(iso).getUTCDay();
}

/** Sunday of the week containing {@code iso}. */
export function startOfWeek(iso: string): string {
  return addDays(iso, -weekday(iso));
}

export function days(first: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(first, i));
}

/** Always 6 weeks (42 days) starting on the Sunday on or before the 1st. */
export function monthGrid(iso: string): string[] {
  return days(startOfWeek(iso.slice(0, 8) + "01"), 42);
}

export function weekDays(iso: string): string[] {
  return days(startOfWeek(iso), 7);
}

/**
 * Last calendar day a schedule occupies. An end at exactly 00:00 on a later day does not occupy that day.
 */
function lastDay(s: Pick<ScheduleSummary, "startAt" | "endAt">): string {
  const endDay = s.endAt.slice(0, 10);
  if (s.endAt.slice(11, 16) === "00:00" && endDay > s.startAt.slice(0, 10)) {
    return addDays(endDay, -1);
  }
  return endDay;
}

/** Schedules touching {@code day}, in the server's order (start time ascending). */
export function schedulesOn<T extends Pick<ScheduleSummary, "startAt" | "endAt">>(items: T[], day: string): T[] {
  return items.filter((s) => s.startAt.slice(0, 10) <= day && lastDay(s) >= day);
}

/** "10:00" when it starts that day, otherwise it continues from an earlier day. */
export function startsOn(s: Pick<ScheduleSummary, "startAt">, day: string): boolean {
  return s.startAt.slice(0, 10) === day;
}

export function timeOf(value: string): string {
  return value.slice(11, 16);
}

export function monthTitle(iso: string): string {
  return `${Number(iso.slice(0, 4))}년 ${Number(iso.slice(5, 7))}월`;
}

export function dayLabel(iso: string): string {
  return `${Number(iso.slice(0, 4))}년 ${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일 (${WEEKDAY_LABELS[weekday(iso)]})`;
}

export function weekTitle(iso: string): string {
  const [first, last] = [startOfWeek(iso), addDays(startOfWeek(iso), 6)];
  return `${first.replace(/-/g, ".")} – ${last.slice(5).replace("-", ".")}`;
}

/**
 * Week/agenda label: "10:00–11:00", "13:00–9/16 12:00" when it ends on a later day,
 * "(계속)–12:00" when it started on an earlier day.
 */
export function timeRange(s: Pick<ScheduleSummary, "startAt" | "endAt">, day: string): string {
  const start = startsOn(s, day) ? timeOf(s.startAt) : "(계속)";
  const endDay = s.endAt.slice(0, 10);
  const end = endDay === day ? timeOf(s.endAt) : `${Number(endDay.slice(5, 7))}/${Number(endDay.slice(8, 10))} ${timeOf(s.endAt)}`;
  return `${start}–${end}`;
}
