package com.myproject.user.seed;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * First ADMIN for a fresh database (env BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD).
 * The optional nickname (BOOTSTRAP_ADMIN_NICKNAME) is the ADMIN's login name in test mode.
 */
@ConfigurationProperties("app.bootstrap-admin")
public record BootstrapAdminProperties(String loginIdentifier, String password, String nickname) {

    public boolean configured() {
        return loginIdentifier != null && !loginIdentifier.isBlank();
    }

    public boolean hasNickname() {
        return nickname != null && !nickname.isBlank();
    }

    /**
     * Intentionally excludes password.
     */
    @Override
    public String toString() {
        return "BootstrapAdminProperties{loginIdentifier=" + loginIdentifier + ", nickname=" + nickname + '}';
    }
}
