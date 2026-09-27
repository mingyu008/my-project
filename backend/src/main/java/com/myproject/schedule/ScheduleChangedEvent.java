package com.myproject.schedule;

import java.time.LocalDateTime;
import java.util.Objects;

/**
 * Published by ScheduleService inside the transaction; listeners that notify outside systems must use
 * {@code @TransactionalEventListener(AFTER_COMMIT)} so nothing is sent for a rolled-back change.
 *
 * @param previous state before an update; null for a new schedule
 * @param actor    login identifier of the user who made the change
 */
public record ScheduleChangedEvent(Type type, Snapshot schedule, Snapshot previous, String actor) {

    public enum Type {
        CREATED,
        UPDATED
    }

    /**
     * Plain values copied from the entity, so listeners never touch a detached or lazy entity after commit.
     * The description is left out on purpose (long and possibly sensitive).
     */
    public record Snapshot(
            long id,
            String title,
            LocalDateTime startAt,
            LocalDateTime endAt,
            ScheduleStatus status,
            SchedulePriority priority,
            String assignee,
            String location,
            boolean publicSchedule
    ) {

        static Snapshot of(Schedule s) {
            return new Snapshot(s.getId(), s.getTitle(), s.getStartAt(), s.getEndAt(), s.getStatus(), s.getPriority(),
                    s.getAssignee() == null ? null : s.getAssignee().getLoginIdentifier(), s.getLocation(), s.isPublicSchedule());
        }
    }

    /** True when an update changed nothing a notification would show. */
    public boolean unchanged() {
        return previous != null && Objects.equals(previous, schedule);
    }
}
