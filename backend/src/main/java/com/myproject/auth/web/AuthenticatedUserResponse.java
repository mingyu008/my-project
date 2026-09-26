package com.myproject.auth.web;

import com.myproject.auth.service.AuthenticatedUser;
import com.myproject.user.domain.Role;

import java.util.Set;

public record AuthenticatedUserResponse(Long id, String loginIdentifier, Set<Role> roles) {

    public static AuthenticatedUserResponse from(AuthenticatedUser user) {
        return new AuthenticatedUserResponse(user.id(), user.loginIdentifier(), user.roles());
    }
}
