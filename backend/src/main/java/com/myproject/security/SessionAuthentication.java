package com.myproject.security;

import com.myproject.auth.service.AuthenticatedUser;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/**
 * The Authentication stored in the HttpSession for a logged-in user.
 */
public final class SessionAuthentication {

    private SessionAuthentication() {
    }

    public static Authentication of(AuthenticatedUser user) {
        return UsernamePasswordAuthenticationToken.authenticated(
                user,
                null,
                user.roles().stream().map(role -> new SimpleGrantedAuthority("ROLE_" + role.name())).toList()
        );
    }
}
