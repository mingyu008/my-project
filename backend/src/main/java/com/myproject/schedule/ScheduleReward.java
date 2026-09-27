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
import java.util.Objects;

/**
 * Points granted by a reward manager for a completed schedule. The reason is plain text; never render it as HTML.
 * Only PENDING rewards can be changed; PAID and CANCELLED are kept as history.
 */
@Entity
@Table(name = "schedule_rewards", indexes = {
        @Index(name = "idx_schedule_rewards_schedule_id", columnList = "schedule_id"),
        @Index(name = "idx_schedule_rewards_recipient_status", columnList = "recipient_id, status"),
        @Index(name = "idx_schedule_rewards_status", columnList = "status")
})
public class ScheduleReward {

    public static final int MIN_POINTS = 1;
    public static final int MAX_POINTS = 100_000;
    public static final int REASON_MAX_LENGTH = 500;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "schedule_id", nullable = false, updatable = false)
    private Schedule schedule;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipient_id", nullable = false)
    private User recipient;

    @Column(name = "points", nullable = false)
    private int points;

    @Column(name = "reason", nullable = false, length = REASON_MAX_LENGTH)
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private RewardStatus status;

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

    @Column(name = "paid_at")
    private Instant paidAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected ScheduleReward() {
    }

    public static ScheduleReward create(Schedule schedule, User recipient, int points, String reason, User creator) {
        ScheduleReward reward = new ScheduleReward();
        reward.schedule = Objects.requireNonNull(schedule, "schedule");
        reward.createdBy = Objects.requireNonNull(creator, "creator");
        reward.status = RewardStatus.PENDING;
        reward.apply(recipient, points, reason, creator);
        return reward;
    }

    public void update(User recipient, int points, String reason, User editor) {
        requirePending();
        apply(recipient, points, reason, editor);
    }

    public void pay(User editor) {
        requirePending();
        this.status = RewardStatus.PAID;
        this.paidAt = Instant.now();
        this.updatedBy = Objects.requireNonNull(editor, "editor");
    }

    public void cancel(User editor) {
        requirePending();
        this.status = RewardStatus.CANCELLED;
        this.updatedBy = Objects.requireNonNull(editor, "editor");
    }

    public boolean isPending() {
        return status == RewardStatus.PENDING;
    }

    public boolean isFor(long userId) {
        return recipient.getId() != null && recipient.getId() == userId;
    }

    private void apply(User recipient, int points, String reason, User editor) {
        if (points < MIN_POINTS || points > MAX_POINTS) {
            throw new IllegalArgumentException("points must be " + MIN_POINTS + " to " + MAX_POINTS);
        }
        if (reason == null || reason.isBlank() || reason.strip().length() > REASON_MAX_LENGTH) {
            throw new IllegalArgumentException("reason must be 1 to " + REASON_MAX_LENGTH + " characters");
        }
        this.recipient = Objects.requireNonNull(recipient, "recipient");
        this.points = points;
        this.reason = reason.strip();
        this.updatedBy = Objects.requireNonNull(editor, "editor");
    }

    private void requirePending() {
        if (!isPending()) {
            throw new IllegalStateException("Only PENDING rewards can change");
        }
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

    public Schedule getSchedule() {
        return schedule;
    }

    public User getRecipient() {
        return recipient;
    }

    public int getPoints() {
        return points;
    }

    public String getReason() {
        return reason;
    }

    public RewardStatus getStatus() {
        return status;
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

    public Instant getPaidAt() {
        return paidAt;
    }

    public long getVersion() {
        return version;
    }

    @Override
    public String toString() {
        return "ScheduleReward{id=" + id + '}';
    }
}
