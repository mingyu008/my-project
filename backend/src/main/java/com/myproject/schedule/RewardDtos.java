package com.myproject.schedule;

import com.myproject.schedule.ScheduleDtos.UserRef;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Reward API bodies. Status, audit fields and paidAt are output only (changed through pay/cancel).
 */
public final class RewardDtos {

    private RewardDtos() {
    }

    /** Create and update body. {@code version} is required for update and ignored on create. */
    public record RewardRequest(
            @NotNull Long recipientId,
            @NotNull @Min(ScheduleReward.MIN_POINTS) @Max(ScheduleReward.MAX_POINTS) Integer points,
            @NotBlank @Size(max = ScheduleReward.REASON_MAX_LENGTH) String reason,
            Long version
    ) {
    }

    /**
     * {@code manageable} tells the UI whether this user may edit/pay/cancel; the server re-checks every change.
     * SCHEDULE rewards carry scheduleId/scheduleTitle; STUDY rewards carry studyDate/studySec instead.
     */
    public record RewardResponse(
            long id,
            RewardSource source,
            Long scheduleId,
            String scheduleTitle,
            LocalDate studyDate,
            Integer studySec,
            UserRef recipient,
            int points,
            String reason,
            RewardStatus status,
            UserRef createdBy,
            Instant createdAt,
            UserRef updatedBy,
            Instant updatedAt,
            Instant paidAt,
            long version,
            boolean manageable
    ) {

        static RewardResponse from(ScheduleReward r, boolean manageable) {
            Schedule schedule = r.getSchedule();
            return new RewardResponse(r.getId(), r.getSource(), schedule == null ? null : schedule.getId(),
                    schedule == null ? null : schedule.getTitle(), r.getStudyDate(), r.getStudySec(), UserRef.from(r.getRecipient()),
                    r.getPoints(), r.getReason(), r.getStatus(), UserRef.from(r.getCreatedBy()), r.getCreatedAt(),
                    UserRef.from(r.getUpdatedBy()), r.getUpdatedAt(), r.getPaidAt(), r.getVersion(), manageable);
        }
    }

    /** {@code canManage}: the user may add rewards to this schedule (reward manager and schedule completed). */
    public record ScheduleRewards(List<RewardResponse> items, boolean canManage) {
    }

    public record RewardPage(List<RewardResponse> content, int page, int size, long totalElements, int totalPages) {
    }

    public record RewardSummary(UserRef recipient, long pendingPoints, long paidPoints, long paidCount) {
    }

    /** Body of a study-day reward; the recipient and day come from the URL/review screen. */
    public record StudyRewardRequest(
            @NotNull LocalDate date,
            @NotNull @Min(ScheduleReward.MIN_POINTS) @Max(ScheduleReward.MAX_POINTS) Integer points,
            @NotBlank @Size(max = ScheduleReward.REASON_MAX_LENGTH) String reason
    ) {
    }
}
