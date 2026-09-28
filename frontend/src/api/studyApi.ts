import { apiClient } from "./client";

// Mirrors server limits (Subject.NAME_MAX_LENGTH, StudyService, StudySession.MAX_SECONDS, StudyGoal).
export const SUBJECT_NAME_MAX_LENGTH = 20;
export const MAX_SUBJECTS = 20;
export const MIN_MANUAL_SEC = 60;
export const MAX_DAY_SEC = 24 * 60 * 60;
export const MIN_GOAL_SEC = 10 * 60;

export type StudyMode = "STOPWATCH" | "POMODORO_FOCUS" | "MANUAL";

/** Subject names are plain text: render them as text only. */
export interface Subject {
  id: number;
  name: string;
}

export interface SubjectTotal {
  subjectId: number;
  name: string;
  durationSec: number;
}

/** Completed study time of one Asia/Seoul day; every subject is listed (0 included). */
export interface StudySummary {
  date: string;
  totalSec: number;
  goalSec: number;
  subjects: SubjectTotal[];
}

/**
 * A study session. Timer sessions are open until stopped; the server computes the recorded duration.
 * {@code serverTime} lets the client correct its own clock.
 */
export interface StudySession {
  id: number;
  subjectId: number;
  subjectName: string;
  mode: StudyMode;
  recordDate: string;
  startTime: string | null;
  endTime: string | null;
  pausedAt: string | null;
  pausedSec: number;
  plannedSec: number | null;
  durationSec: number;
  completed: boolean;
  serverTime: string;
}

export type ManualInput =
  | { subjectId: number; durationSec: number; recordDate?: string }
  | { subjectId: number; startTime: string; endTime: string };

export const studyApi = {
  /** The first call creates the default subjects (수학, 영어, 국어, 탐구, 기타). */
  subjects(signal?: AbortSignal): Promise<Subject[]> {
    return apiClient.get<Subject[]>("/api/study/subjects", signal);
  },

  addSubject(name: string): Promise<Subject> {
    return apiClient.post<Subject>("/api/study/subjects", { name });
  },

  /** Today (Asia/Seoul) unless a yyyy-MM-dd date is given. */
  summary(date?: string, signal?: AbortSignal): Promise<StudySummary> {
    return apiClient.get<StudySummary>(`/api/study/summary${date ? `?date=${encodeURIComponent(date)}` : ""}`, signal);
  },

  setGoal(dailyGoalSec: number): Promise<{ dailyGoalSec: number }> {
    return apiClient.put<{ dailyGoalSec: number }>("/api/study/goal", { dailyGoalSec });
  },

  /** The open timer session, or undefined (204) when there is none. */
  active(signal?: AbortSignal): Promise<StudySession | undefined> {
    return apiClient.get<StudySession | undefined>("/api/study/sessions/active", signal);
  },

  start(input: { subjectId: number; mode: "STOPWATCH" | "POMODORO_FOCUS"; plannedSec?: number }): Promise<StudySession> {
    return apiClient.post<StudySession>("/api/study/sessions/start", input);
  },

  pause(id: number): Promise<StudySession> {
    return apiClient.post<StudySession>(`/api/study/sessions/${id}/pause`);
  },

  resume(id: number): Promise<StudySession> {
    return apiClient.post<StudySession>(`/api/study/sessions/${id}/resume`);
  },

  /**
   * Idempotent on the server: a retried stop never records twice.
   *
   * @param endTime when stop was pressed (ISO instant); the server clamps it to [start, now]
   */
  stop(id: number, endTime?: string): Promise<StudySession> {
    return apiClient.post<StudySession>(`/api/study/sessions/${id}/stop`, { endTime: endTime ?? null });
  },

  /** Ends an open session without recording it. */
  discard(id: number): Promise<void> {
    return apiClient.delete<void>(`/api/study/sessions/${id}`);
  },

  manual(input: ManualInput): Promise<StudySession> {
    return apiClient.post<StudySession>("/api/study/sessions/manual", input);
  },
};
