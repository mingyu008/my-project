package com.myproject.auth.service;

import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;

import java.util.Set;

/**
 * Result of a successful authentication. Carries no password or passwordHash.
 */
public record AuthenticatedUser(
        Long id,
        String loginIdentifier,
        Set<Role> roles
) {

    public static AuthenticatedUser from(User user) {
        return new AuthenticatedUser(user.getId(), user.getLoginIdentifier(), Set.copyOf(user.getRoles()));
    }
}
