package com.myproject.study;

/**
 * How a study session was recorded. Pomodoro breaks are never stored (rest is not study time).
 */
public enum StudyMode {
    STOPWATCH,
    POMODORO_FOCUS,
    /** Quick add (+10분 …) and direct input. */
    MANUAL;

    public boolean isTimer() {
        return this != MANUAL;
    }
}
