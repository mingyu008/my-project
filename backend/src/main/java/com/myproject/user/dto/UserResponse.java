package com.myproject.user.dto;

import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.domain.UserStatus;

import java.time.Instant;
import java.util.Set;

/**
 * API representation of a user. Does not carry passwordHash by construction.
 */
public record UserResponse(
        Long id,
        String loginIdentifier,
        UserStatus status,
        Set<Role> roles,
        Instant createdAt
) {

    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(),
                user.getLoginIdentifier(),
                user.getStatus(),
                Set.copyOf(user.getRoles()),
                user.getCreatedAt()
        );
    }
}
