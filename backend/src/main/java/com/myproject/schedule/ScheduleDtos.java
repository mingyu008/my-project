package com.myproject.schedule;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.myproject.user.domain.User;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Schedule API request/response bodies. Audit fields (createdBy/updatedBy/timestamps) are output only.
 */
public final class ScheduleDtos {

    private ScheduleDtos() {
    }

    /**
     * Create and update body. {@code version} is required for update (optimistic lock) and ignored on create.
     */
    public record ScheduleRequest(
            @NotBlank @Size(max = Schedule.TITLE_MAX_LENGTH) String title,
            @Size(max = Schedule.DESCRIPTION_MAX_LENGTH) String description,
            @NotNull LocalDateTime startAt,
            @NotNull LocalDateTime endAt,
            @NotNull ScheduleStatus status,
            @NotNull SchedulePriority priority,
            Long assigneeId,
            @Size(max = Schedule.LOCATION_MAX_LENGTH) String location,
            @JsonProperty("isPublic") @NotNull Boolean isPublic,
            @Pattern(regexp = Schedule.COLOR_PATTERN) String color,
            Long version
    ) {
    }

    /** List filters; every field is optional. */
    public record ScheduleSearch(
            String keyword,
            LocalDate from,
            LocalDate to,
            ScheduleStatus status,
            SchedulePriority priority,
            Long assigneeId,
            Long createdById
    ) {
    }

    public record UserRef(long id, String loginIdentifier) {

        static UserRef from(User user) {
            return user == null ? null : new UserRef(user.getId(), user.getLoginIdentifier());
        }
    }

    /** List row (no description). */
    public record ScheduleSummary(
            long id,
            String title,
            LocalDateTime startAt,
            LocalDateTime endAt,
            ScheduleStatus status,
            SchedulePriority priority,
            UserRef assignee,
            String location,
            @JsonProperty("isPublic") boolean isPublic,
            String color,
            UserRef createdBy,
            Instant createdAt,
            Instant updatedAt
    ) {

        static ScheduleSummary from(Schedule s) {
            return new ScheduleSummary(s.getId(), s.getTitle(), s.getStartAt(), s.getEndAt(), s.getStatus(), s.getPriority(),
                    UserRef.from(s.getAssignee()), s.getLocation(), s.isPublicSchedule(), s.getColor(),
                    UserRef.from(s.getCreatedBy()), s.getCreatedAt(), s.getUpdatedAt());
        }
    }

    /**
     * {@code editable} tells the UI whether to show edit/delete; the server re-checks on every change.
     */
    public record ScheduleDetail(
            long id,
            String title,
            String description,
            LocalDateTime startAt,
            LocalDateTime endAt,
            ScheduleStatus status,
            SchedulePriority priority,
            UserRef assignee,
            String location,
            @JsonProperty("isPublic") boolean isPublic,
            String color,
            UserRef createdBy,
            Instant createdAt,
            UserRef updatedBy,
            Instant updatedAt,
            long version,
            boolean editable
    ) {

        static ScheduleDetail from(Schedule s, boolean editable) {
            return new ScheduleDetail(s.getId(), s.getTitle(), s.getDescription(), s.getStartAt(), s.getEndAt(), s.getStatus(),
                    s.getPriority(), UserRef.from(s.getAssignee()), s.getLocation(), s.isPublicSchedule(), s.getColor(),
                    UserRef.from(s.getCreatedBy()), s.getCreatedAt(), UserRef.from(s.getUpdatedBy()), s.getUpdatedAt(),
                    s.getVersion(), editable);
        }
    }

    public record SchedulePage(List<ScheduleSummary> content, int page, int size, long totalElements, int totalPages) {
    }

    /** Calendar range result; {@code truncated} when more than ScheduleService.MAX_CALENDAR_ITEMS matched. */
    public record CalendarResult(List<ScheduleSummary> items, boolean truncated) {
    }

    /** An overlapping schedule the caller is allowed to see. */
    public record ConflictItem(long id, String title, LocalDateTime startAt, LocalDateTime endAt) {
    }

    /**
     * {@code conflict} counts every overlapping schedule of the assignee; {@code items} lists only those the
     * caller may see (a busy slot of someone else's private schedule shows up as {@code hiddenCount}).
     */
    public record ConflictResult(boolean conflict, List<ConflictItem> items, long hiddenCount) {
    }
}
