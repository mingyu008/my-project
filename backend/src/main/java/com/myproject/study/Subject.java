package com.myproject.study;

import com.myproject.user.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.util.Objects;

/**
 * A user's own study subject (수학, 영어 …). Names are plain text; never render them as HTML.
 */
@Entity
@Table(name = "study_subjects",
        uniqueConstraints = @UniqueConstraint(name = "uk_study_subjects_user_name", columnNames = {"user_id", "name"}))
public class Subject {

    public static final int NAME_MAX_LENGTH = 20;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, updatable = false)
    private User user;

    @Column(name = "name", nullable = false, length = NAME_MAX_LENGTH)
    private String name;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected Subject() {
    }

    /**
     * @param name already validated with {@link #normalizeName(String)}
     */
    public static Subject create(User user, String name, int sortOrder) {
        Subject subject = new Subject();
        subject.user = Objects.requireNonNull(user, "user");
        subject.name = normalizeName(name);
        subject.sortOrder = sortOrder;
        return subject;
    }

    /**
     * Trimmed, 1 to 20 characters, no control characters.
     *
     * @throws IllegalArgumentException otherwise
     */
    public static String normalizeName(String name) {
        if (name == null) {
            throw new IllegalArgumentException("name must not be blank");
        }
        String normalized = name.strip();
        if (normalized.isEmpty() || normalized.length() > NAME_MAX_LENGTH || normalized.chars().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("name must be 1 to " + NAME_MAX_LENGTH + " characters");
        }
        return normalized;
    }

    @PrePersist
    void onCreate() {
        this.createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public User getUser() {
        return user;
    }

    public String getName() {
        return name;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    @Override
    public String toString() {
        return "Subject{id=" + id + '}';
    }
}
