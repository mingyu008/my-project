package com.myproject.study;

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

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;

/**
 * One block of study time.
 * <p>
 * Timer sessions (STOPWATCH, POMODORO_FOCUS) are open until stopped. Their duration is always computed here from
 * server timestamps — start, pauses, end — never taken from the client. MANUAL sessions are complete on creation.
 */
@Entity
@Table(name = "study_sessions", indexes = {
        @Index(name = "idx_study_sessions_user_date", columnList = "user_id, record_date"),
        @Index(name = "idx_study_sessions_user_completed", columnList = "user_id, completed"),
        @Index(name = "idx_study_sessions_subject_id", columnList = "subject_id")
})
public class StudySession {

    /** Upper bound for one session and for one day's total (a forgotten timer does not record days). */
    public static final int MAX_SECONDS = 24 * 60 * 60;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, updatable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "subject_id", nullable = false, updatable = false)
    private Subject subject;

    @Enumerated(EnumType.STRING)
    @Column(name = "mode", nullable = false, length = 20, updatable = false)
    private StudyMode mode;

    @Column(name = "record_date", nullable = false, updatable = false)
    private LocalDate recordDate;

    @Column(name = "start_time")
    private Instant startTime;

    @Column(name = "end_time")
    private Instant endTime;

    @Column(name = "paused_at")
    private Instant pausedAt;

    @Column(name = "paused_sec", nullable = false)
    private long pausedSec;

    /** Pomodoro focus length; the recorded time never exceeds it. Null for other modes. */
    @Column(name = "planned_sec")
    private Integer plannedSec;

    @Column(name = "duration_sec", nullable = false)
    private int durationSec;

    @Column(name = "completed", nullable = false)
    private boolean completed;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected StudySession() {
    }

    public static StudySession start(User user, Subject subject, StudyMode mode, Integer plannedSec, Instant now, LocalDate recordDate) {
        if (!mode.isTimer()) {
            throw new IllegalArgumentException("mode must be a timer mode");
        }
        StudySession session = base(user, subject, mode, recordDate);
        session.startTime = Objects.requireNonNull(now, "now");
        session.plannedSec = mode == StudyMode.POMODORO_FOCUS ? plannedSec : null;
        return session;
    }

    /**
     * @param startTime null together with endTime when only a duration was given
     */
    public static StudySession manual(User user, Subject subject, LocalDate recordDate, int durationSec,
                                      Instant startTime, Instant endTime) {
        StudySession session = base(user, subject, StudyMode.MANUAL, recordDate);
        session.startTime = startTime;
        session.endTime = endTime;
        session.durationSec = durationSec;
        session.completed = true;
        return session;
    }

    private static StudySession base(User user, Subject subject, StudyMode mode, LocalDate recordDate) {
        StudySession session = new StudySession();
        session.user = Objects.requireNonNull(user, "user");
        session.subject = Objects.requireNonNull(subject, "subject");
        session.mode = mode;
        session.recordDate = Objects.requireNonNull(recordDate, "recordDate");
        return session;
    }

    public boolean isActive() {
        return !completed;
    }

    public boolean isPaused() {
        return pausedAt != null;
    }

    public void pause(Instant now) {
        requireActive();
        if (pausedAt == null) {
            pausedAt = now;
        }
    }

    public void resume(Instant now) {
        requireActive();
        if (pausedAt != null) {
            pausedSec += Math.max(0, Duration.between(pausedAt, now).getSeconds());
            pausedAt = null;
        }
    }

    /**
     * Ends the session at {@code end} (already clamped to [start, now] by the caller). Time after a pause started
     * does not count; pomodoro focus never exceeds its planned length.
     */
    public void stop(Instant end) {
        requireActive();
        Instant activeEnd = pausedAt != null && pausedAt.isBefore(end) ? pausedAt : end;
        long seconds = Math.max(0, Duration.between(startTime, activeEnd).getSeconds() - pausedSec);
        if (plannedSec != null) {
            seconds = Math.min(seconds, plannedSec);
        }
        this.durationSec = (int) Math.min(seconds, MAX_SECONDS);
        this.endTime = end;
        this.pausedAt = null;
        this.completed = true;
    }

    private void requireActive() {
        if (completed) {
            throw new IllegalStateException("Session is already completed");
        }
    }

    public boolean isOwnedBy(long userId) {
        return user.getId() != null && user.getId() == userId;
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

    public Subject getSubject() {
        return subject;
    }

    public StudyMode getMode() {
        return mode;
    }

    public LocalDate getRecordDate() {
        return recordDate;
    }

    public Instant getStartTime() {
        return startTime;
    }

    public Instant getEndTime() {
        return endTime;
    }

    public Instant getPausedAt() {
        return pausedAt;
    }

    public long getPausedSec() {
        return pausedSec;
    }

    public Integer getPlannedSec() {
        return plannedSec;
    }

    public int getDurationSec() {
        return durationSec;
    }

    public boolean isCompleted() {
        return completed;
    }

    @Override
    public String toString() {
        return "StudySession{id=" + id + ", mode=" + mode + ", completed=" + completed + '}';
    }
}
