package com.myproject.study;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Study timer API bodies. Names follow the existing API (camelCase, numeric ids) rather than the spec's
 * snake_case/uuid sketch (TASK-TIMER-01 §21-8: existing contracts first).
 */
public final class StudyDtos {

    private StudyDtos() {
    }

    public record SubjectResponse(long id, String name) {

        static SubjectResponse from(Subject s) {
            return new SubjectResponse(s.getId(), s.getName());
        }
    }

    public record SubjectRequest(String name) {
    }

    public record GoalRequest(Integer dailyGoalSec) {
    }

    public record SubjectTotal(long subjectId, String name, long durationSec) {
    }

    /** Completed sessions of one Asia/Seoul day. Every subject is listed, including those with 0. */
    public record Summary(LocalDate date, long totalSec, int goalSec, List<SubjectTotal> subjects) {
    }

    /**
     * @param plannedSec pomodoro focus length in seconds (required for POMODORO_FOCUS, ignored otherwise)
     */
    public record StartRequest(Long subjectId, StudyMode mode, Integer plannedSec) {
    }

    /**
     * @param endTime when the user pressed stop (may be earlier than now if the request was queued offline);
     *                null = now. Clamped to [start, now] by the server.
     */
    public record StopRequest(Instant endTime) {
    }

    /**
     * Either {@code durationSec}, or {@code startTime} + {@code endTime} (the server computes the duration).
     *
     * @param recordDate null = the start time's day, or today
     */
    public record ManualRequest(Long subjectId, Integer durationSec, LocalDate recordDate, Instant startTime, Instant endTime) {
    }

    /**
     * {@code serverTime} lets the client correct its own clock: elapsed = serverNow - startTime - pausedSec
     * (minus the current pause).
     */
    public record SessionResponse(
            long id,
            long subjectId,
            String subjectName,
            StudyMode mode,
            LocalDate recordDate,
            Instant startTime,
            Instant endTime,
            Instant pausedAt,
            long pausedSec,
            Integer plannedSec,
            int durationSec,
            boolean completed,
            Instant serverTime
    ) {

        static SessionResponse from(StudySession s, Instant serverTime) {
            return new SessionResponse(s.getId(), s.getSubject().getId(), s.getSubject().getName(), s.getMode(),
                    s.getRecordDate(), s.getStartTime(), s.getEndTime(), s.getPausedAt(), s.getPausedSec(),
                    s.getPlannedSec(), s.getDurationSec(), s.isCompleted(), serverTime);
        }
    }
}
