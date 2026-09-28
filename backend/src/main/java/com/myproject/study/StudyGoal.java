package com.myproject.study;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * A user's daily study goal. Users without a row get {@link #DEFAULT_SECONDS}.
 */
@Entity
@Table(name = "study_goals")
public class StudyGoal {

    public static final int DEFAULT_SECONDS = 8 * 60 * 60;
    public static final int MIN_SECONDS = 10 * 60;
    public static final int MAX_SECONDS = 24 * 60 * 60;

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "daily_goal_sec", nullable = false)
    private int dailyGoalSec;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected StudyGoal() {
    }

    public StudyGoal(long userId, int dailyGoalSec) {
        this.userId = userId;
        change(dailyGoalSec);
    }

    public void change(int seconds) {
        if (seconds < MIN_SECONDS || seconds > MAX_SECONDS) {
            throw new IllegalArgumentException("goal out of range");
        }
        this.dailyGoalSec = seconds;
    }

    @PrePersist
    @PreUpdate
    void touch() {
        this.updatedAt = Instant.now();
    }

    public int getDailyGoalSec() {
        return dailyGoalSec;
    }
}
