package com.myproject.auth.service;

import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;

import java.io.Serializable;
import java.util.Set;

/**
 * Result of a successful authentication and the security principal stored in the session.
 * Carries no password or passwordHash. Serializable so it can live in a shared session store.
 *
 * @param nickname null for accounts without one
 */
public record AuthenticatedUser(
        Long id,
        String loginIdentifier,
        String nickname,
        Set<Role> roles
) implements Serializable {

    public static AuthenticatedUser from(User user) {
        return new AuthenticatedUser(user.getId(), user.getLoginIdentifier(), user.getNickname(), Set.copyOf(user.getRoles()));
    }
}
