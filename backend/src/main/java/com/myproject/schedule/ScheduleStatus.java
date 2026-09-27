package com.myproject.schedule;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * Stored as the string code (never the ordinal).
 */
public enum ScheduleStatus {
    PLANNED,
    IN_PROGRESS,
    COMPLETED,
    CANCELLED;

    private static final Map<ScheduleStatus, Set<ScheduleStatus>> ALLOWED_TRANSITIONS = Map.of(
            PLANNED, EnumSet.of(IN_PROGRESS, CANCELLED),
            IN_PROGRESS, EnumSet.of(COMPLETED, CANCELLED),
            COMPLETED, EnumSet.noneOf(ScheduleStatus.class),
            CANCELLED, EnumSet.noneOf(ScheduleStatus.class)
    );

    /**
     * Keeping the same status is always allowed. ADMIN may bypass this rule (see ScheduleService).
     */
    public boolean canChangeTo(ScheduleStatus next) {
        return this == next || ALLOWED_TRANSITIONS.get(this).contains(next);
    }
}
