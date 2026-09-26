package com.myproject.user.seed;

import com.myproject.user.domain.Role;
import com.myproject.user.domain.UserStatus;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.util.List;
import java.util.Set;

/**
 * Users created at startup for local development and E2E tests. Never active in the prod profile.
 */
@ConfigurationProperties("app.seed")
public record SeedUsersProperties(
        @DefaultValue("false") boolean enabled,
        @DefaultValue List<SeedUser> users
) {

    public record SeedUser(
            String loginIdentifier,
            String password,
            @DefaultValue("USER") Set<Role> roles,
            @DefaultValue("ACTIVE") UserStatus status
    ) {

        /**
         * Intentionally excludes password.
         */
        @Override
        public String toString() {
            return "SeedUser{loginIdentifier='" + loginIdentifier + "', roles=" + roles + ", status=" + status + '}';
        }
    }
}
