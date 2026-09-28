import type { StudySession } from "../../api/studyApi";

/**
 * Time math for the study timer. Elapsed time always comes from timestamps (start, pauses, now), never from
 * counting interval ticks, so a throttled background tab shows the right time as soon as it wakes up.
 */

/** Server clock minus client clock, measured when a session response arrives. */
export function clockOffset(session: Pick<StudySession, "serverTime">, receivedAt: number = Date.now()): number {
  const server = Date.parse(session.serverTime);
  return Number.isNaN(server) ? 0 : server - receivedAt;
}

/** Seconds of study in an open timer session at server time {@code now} (pauses excluded). */
export function elapsedSec(session: Pick<StudySession, "startTime" | "pausedAt" | "pausedSec">, now: number): number {
  if (!session.startTime) return 0;
  const start = Date.parse(session.startTime);
  const end = session.pausedAt ? Math.min(Date.parse(session.pausedAt), now) : now;
  return Math.max(0, Math.floor((end - start) / 1000) - session.pausedSec);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 01:32:45 */
export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;
}

/** 23:45 (hours folded into minutes: a pomodoro is at most 4 hours). */
export function formatCountdown(totalSec: number): string {
  const sec = Math.max(0, Math.ceil(totalSec));
  return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
}

/** 02시간 30분 */
export function formatHoursMinutes(totalSec: number): string {
  const min = Math.floor(Math.max(0, totalSec) / 60);
  return `${pad(Math.floor(min / 60))}시간 ${pad(min % 60)}분`;
}

/** 30분, 1시간, 1시간 20분 — for toasts. */
export function formatSpoken(totalSec: number): string {
  const min = Math.round(Math.max(0, totalSec) / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

export function goalPercent(totalSec: number, goalSec: number): number {
  if (goalSec <= 0) return 0;
  return Math.min(100, Math.floor((totalSec / goalSec) * 100));
}

/**
 * Seconds between two "HH:mm" times on the same day, or null when end is not after start
 * (a period crossing midnight is entered as two records).
 */
export function periodSec(start: string, end: string): number | null {
  const toMin = (t: string) => {
    const match = /^(\d{2}):(\d{2})$/.exec(t);
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
  };
  const diff = toMin(end) - toMin(start);
  return Number.isNaN(diff) || diff <= 0 ? null : diff * 60;
}

/** ISO instant of "HH:mm" on {@code date} (yyyy-MM-dd) in Asia/Seoul (UTC+9, no daylight saving). */
export function seoulInstant(date: string, time: string): string {
  return new Date(`${date}T${time}:00+09:00`).toISOString();
}

export interface PomodoroPreset {
  id: "standard" | "practice" | "custom";
  label: string;
  focusMin: number;
  breakMin: number;
  /** Long break after this many focus sessions (standard only). */
  longBreakEvery?: number;
  longBreakMin?: number;
}

export const POMODORO_PRESETS: PomodoroPreset[] = [
  { id: "standard", label: "표준", focusMin: 25, breakMin: 5, longBreakEvery: 4, longBreakMin: 15 },
  { id: "practice", label: "실전", focusMin: 50, breakMin: 10 },
  { id: "custom", label: "사용자 설정", focusMin: 40, breakMin: 10 },
];

/** Break length after the {@code completedFocus}-th focus session of the cycle (1-based). */
export function breakSec(preset: PomodoroPreset, completedFocus: number): number {
  const long = preset.longBreakEvery && preset.longBreakMin && completedFocus % preset.longBreakEvery === 0;
  return (long ? preset.longBreakMin! : preset.breakMin) * 60;
}
