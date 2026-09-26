package com.myproject.user.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

/**
 * Authentication user.
 * <p>
 * Only the encoded password (passwordHash) is stored; a raw password never reaches this class.
 * This entity must not be returned from the API directly — use {@code UserResponse}.
 */
@Entity
@Table(
        name = "users",
        uniqueConstraints = @UniqueConstraint(name = "uk_users_login_identifier", columnNames = "login_identifier")
)
public class User {

    public static final int LOGIN_IDENTIFIER_MAX_LENGTH = 100;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "login_identifier", nullable = false, length = LOGIN_IDENTIFIER_MAX_LENGTH)
    private String loginIdentifier;

    @JsonIgnore
    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private UserStatus status;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "user_roles", joinColumns = @JoinColumn(name = "user_id"))
    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 30)
    private Set<Role> roles = EnumSet.noneOf(Role.class);

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected User() {
    }

    private User(String loginIdentifier, String passwordHash, Set<Role> roles) {
        this.loginIdentifier = normalizeLoginIdentifier(loginIdentifier);
        this.passwordHash = requirePasswordHash(passwordHash);
        this.status = UserStatus.ACTIVE;
        this.roles = roles.isEmpty() ? EnumSet.noneOf(Role.class) : EnumSet.copyOf(roles);
    }

    /**
     * @param passwordHash value already encoded by a PasswordEncoder; never a raw password
     */
    public static User create(String loginIdentifier, String passwordHash, Set<Role> roles) {
        Objects.requireNonNull(roles, "roles");
        return new User(loginIdentifier, passwordHash, roles);
    }

    /**
     * Canonical form used for storage and lookup so that uniqueness is case-insensitive.
     */
    public static String normalizeLoginIdentifier(String loginIdentifier) {
        if (loginIdentifier == null || loginIdentifier.isBlank()) {
            throw new IllegalArgumentException("loginIdentifier must not be blank");
        }
        String normalized = loginIdentifier.trim().toLowerCase(Locale.ROOT);
        if (normalized.length() > LOGIN_IDENTIFIER_MAX_LENGTH) {
            throw new IllegalArgumentException("loginIdentifier is too long");
        }
        return normalized;
    }

    private static String requirePasswordHash(String passwordHash) {
        if (passwordHash == null || passwordHash.isBlank()) {
            // Do not include the value in the message.
            throw new IllegalArgumentException("passwordHash must not be blank");
        }
        return passwordHash;
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

    /**
     * INACTIVE users must be rejected by authentication.
     */
    public boolean canAuthenticate() {
        return status == UserStatus.ACTIVE;
    }

    public void changePasswordHash(String newPasswordHash) {
        this.passwordHash = requirePasswordHash(newPasswordHash);
    }

    public void activate() {
        this.status = UserStatus.ACTIVE;
    }

    public void deactivate() {
        this.status = UserStatus.INACTIVE;
    }

    public Long getId() {
        return id;
    }

    public String getLoginIdentifier() {
        return loginIdentifier;
    }

    /**
     * For password verification only. Never log, serialize, or return this value.
     */
    public String getPasswordHash() {
        return passwordHash;
    }

    public UserStatus getStatus() {
        return status;
    }

    public Set<Role> getRoles() {
        return Collections.unmodifiableSet(roles);
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof User other)) {
            return false;
        }
        return id != null && id.equals(other.id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }

    /**
     * Intentionally excludes passwordHash.
     */
    @Override
    public String toString() {
        return "User{id=" + id
                + ", loginIdentifier='" + loginIdentifier + '\''
                + ", status=" + status
                + ", roles=" + roles
                + '}';
    }
}
