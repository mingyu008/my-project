package com.myproject.schedule;

import com.myproject.schedule.ScheduleDtos.ScheduleSearch;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Query conditions built with the Criteria API only (bound parameters, no string-built SQL).
 */
final class ScheduleSpecifications {

    private static final char LIKE_ESCAPE = '\\';

    private ScheduleSpecifications() {
    }

    static Specification<Schedule> notDeleted() {
        return (root, query, cb) -> cb.isFalse(root.get("deleted"));
    }

    /**
     * Non-admin users see schedules they created, schedules assigned to them, and public schedules.
     */
    static Specification<Schedule> visibleTo(long userId) {
        return (root, query, cb) -> {
            Join<Object, Object> assignee = root.join("assignee", JoinType.LEFT);
            return cb.or(
                    cb.equal(root.get("createdBy").get("id"), userId),
                    cb.equal(assignee.get("id"), userId),
                    cb.isTrue(root.get("publicSchedule")));
        };
    }

    static Specification<Schedule> matches(ScheduleSearch search) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (search.keyword() != null && !search.keyword().isBlank()) {
                String pattern = "%" + escapeLike(search.keyword().strip().toLowerCase(Locale.ROOT)) + "%";
                predicates.add(cb.like(cb.lower(root.get("title")), pattern, LIKE_ESCAPE));
            }
            // Period overlap: the schedule touches any moment of [from 00:00, to + 1 day 00:00).
            if (search.from() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("endAt"), search.from().atStartOfDay()));
            }
            if (search.to() != null) {
                predicates.add(cb.lessThan(root.get("startAt"), search.to().plusDays(1).atStartOfDay()));
            }
            if (search.status() != null) {
                predicates.add(cb.equal(root.get("status"), search.status()));
            }
            if (search.priority() != null) {
                predicates.add(cb.equal(root.get("priority"), search.priority()));
            }
            if (search.assigneeId() != null) {
                predicates.add(cb.equal(root.get("assignee").get("id"), search.assigneeId()));
            }
            if (search.createdById() != null) {
                predicates.add(cb.equal(root.get("createdBy").get("id"), search.createdById()));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    /**
     * Same assignee, time ranges overlap ({@code existing.start < end AND existing.end > start}), not cancelled.
     */
    static Specification<Schedule> overlapping(long assigneeId, LocalDateTime startAt, LocalDateTime endAt, Long excludeId) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>(List.of(
                    cb.equal(root.get("assignee").get("id"), assigneeId),
                    cb.lessThan(root.get("startAt"), endAt),
                    cb.greaterThan(root.get("endAt"), startAt),
                    cb.notEqual(root.get("status"), ScheduleStatus.CANCELLED)));
            if (excludeId != null) {
                predicates.add(cb.notEqual(root.get("id"), excludeId));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
