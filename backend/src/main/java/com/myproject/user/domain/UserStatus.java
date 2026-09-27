package com.myproject.user.domain;

public enum UserStatus {
    /** Signed up, waiting for ADMIN approval. Cannot log in. */
    PENDING,
    ACTIVE,
    INACTIVE
}
