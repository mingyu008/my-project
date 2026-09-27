package com.myproject.user.seed;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * First ADMIN for a fresh database (env BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD).
 */
@ConfigurationProperties("app.bootstrap-admin")
public record BootstrapAdminProperties(String loginIdentifier, String password) {

    public boolean configured() {
        return loginIdentifier != null && !loginIdentifier.isBlank();
    }

    /**
     * Intentionally excludes password.
     */
    @Override
    public String toString() {
        return "BootstrapAdminProperties{loginIdentifier=" + loginIdentifier + '}';
    }
}
