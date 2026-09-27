package com.myproject.schedule;

import com.myproject.user.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.regex.Pattern;

/**
 * A schedule entry. Deletion is logical ({@code deleted = true}); every query must filter it explicitly.
 * <p>
 * {@code startAt}/{@code endAt} are wall-clock times in the service time zone (Asia/Seoul, see DECISIONS D-030).
 * Text fields are plain text; clients must never render them as HTML.
 */
@Entity
@Table(name = "schedules", indexes = {
        @Index(name = "idx_schedules_deleted_start_at", columnList = "deleted, start_at"),
        @Index(name = "idx_schedules_end_at", columnList = "end_at"),
        @Index(name = "idx_schedules_status", columnList = "status"),
        @Index(name = "idx_schedules_assignee_id", columnList = "assignee_id"),
        @Index(name = "idx_schedules_created_by", columnList = "created_by")
})
public class Schedule {

    public static final int TITLE_MAX_LENGTH = 200;
    public static final int DESCRIPTION_MAX_LENGTH = 5_000;
    public static final int LOCATION_MAX_LENGTH = 300;
    /** {@code #RRGGBB} only, so the value is safe to use as a CSS color. */
    public static final String COLOR_PATTERN = "^#[0-9a-fA-F]{6}$";

    private static final Pattern COLOR = Pattern.compile(COLOR_PATTERN);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "title", nullable = false, length = TITLE_MAX_LENGTH)
    private String title;

    @Column(name = "description", length = DESCRIPTION_MAX_LENGTH)
    private String description;

    @Column(name = "start_at", nullable = false)
    private LocalDateTime startAt;

    @Column(name = "end_at", nullable = false)
    private LocalDateTime endAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private ScheduleStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "priority", nullable = false, length = 30)
    private SchedulePriority priority;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignee_id")
    private User assignee;

    @Column(name = "location", length = LOCATION_MAX_LENGTH)
    private String location;

    @Column(name = "is_public", nullable = false)
    private boolean publicSchedule;

    @Column(name = "color", length = 20)
    private String color;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by", nullable = false, updatable = false)
    private User createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "updated_by", nullable = false)
    private User updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted", nullable = false)
    private boolean deleted;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected Schedule() {
    }

    /**
     * Field values that the author controls. Audit fields are never taken from the client.
     */
    public record Content(
            String title,
            String description,
            LocalDateTime startAt,
            LocalDateTime endAt,
            SchedulePriority priority,
            User assignee,
            String location,
            boolean publicSchedule,
            String color
    ) {
    }

    public static Schedule create(User creator, Content content, ScheduleStatus status) {
        Schedule schedule = new Schedule();
        schedule.createdBy = Objects.requireNonNull(creator, "creator");
        schedule.status = Objects.requireNonNull(status, "status");
        schedule.apply(content, creator);
        return schedule;
    }

    /**
     * Status changes are validated by the caller (transition rules depend on the user's role).
     */
    public void update(Content content, ScheduleStatus status, User editor) {
        this.status = Objects.requireNonNull(status, "status");
        apply(content, editor);
    }

    public void markDeleted(User editor) {
        this.deleted = true;
        this.updatedBy = Objects.requireNonNull(editor, "editor");
    }

    private void apply(Content content, User editor) {
        if (!isValidPeriod(content.startAt(), content.endAt())) {
            throw new IllegalArgumentException("endAt must not be before startAt");
        }
        this.title = requireText(content.title(), TITLE_MAX_LENGTH, "title").strip();
        this.description = optionalText(content.description(), DESCRIPTION_MAX_LENGTH, "description");
        this.startAt = content.startAt();
        this.endAt = content.endAt();
        this.priority = Objects.requireNonNull(content.priority(), "priority");
        this.assignee = content.assignee();
        this.location = optionalText(content.location(), LOCATION_MAX_LENGTH, "location");
        this.publicSchedule = content.publicSchedule();
        if (content.color() != null && !COLOR.matcher(content.color()).matches()) {
            throw new IllegalArgumentException("color must be #RRGGBB");
        }
        this.color = content.color();
        this.updatedBy = Objects.requireNonNull(editor, "editor");
    }

    /**
     * Start and end at the same time is allowed (MVP policy); only end before start is rejected.
     */
    public static boolean isValidPeriod(LocalDateTime startAt, LocalDateTime endAt) {
        return startAt != null && endAt != null && !endAt.isBefore(startAt);
    }

    public boolean isCreatedBy(long userId) {
        return createdBy.getId() != null && createdBy.getId() == userId;
    }

    public boolean isAssignedTo(long userId) {
        return assignee != null && assignee.getId() != null && assignee.getId() == userId;
    }

    private static String requireText(String value, int maxLength, String field) {
        if (value == null || value.isBlank() || value.length() > maxLength) {
            throw new IllegalArgumentException(field + " must be 1 to " + maxLength + " characters");
        }
        return value;
    }

    /** Blank optional text is stored as null. */
    private static String optionalText(String value, int maxLength, String field) {
        if (value == null || value.isBlank()) {
            return null;
        }
        if (value.length() > maxLength) {
            throw new IllegalArgumentException(field + " must be at most " + maxLength + " characters");
        }
        return value;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public LocalDateTime getStartAt() {
        return startAt;
    }

    public LocalDateTime getEndAt() {
        return endAt;
    }

    public ScheduleStatus getStatus() {
        return status;
    }

    public SchedulePriority getPriority() {
        return priority;
    }

    public User getAssignee() {
        return assignee;
    }

    public String getLocation() {
        return location;
    }

    public boolean isPublicSchedule() {
        return publicSchedule;
    }

    public String getColor() {
        return color;
    }

    public User getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public User getUpdatedBy() {
        return updatedBy;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public boolean isDeleted() {
        return deleted;
    }

    public long getVersion() {
        return version;
    }

    @Override
    public String toString() {
        return "Schedule{id=" + id + '}';
    }
}
