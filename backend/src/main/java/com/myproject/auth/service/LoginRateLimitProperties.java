package com.myproject.auth.service;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

/**
 * Failed-login limits within a fixed window. Provisional values until TASK-01 decides the policy.
 */
@ConfigurationProperties("app.login-rate-limit")
public record LoginRateLimitProperties(
        @DefaultValue("5") int maxFailuresPerIdentifier,
        @DefaultValue("50") int maxFailuresPerClient,
        @DefaultValue("15m") Duration window
) {

    public LoginRateLimitProperties {
        if (maxFailuresPerIdentifier < 1 || maxFailuresPerClient < 1 || window.isNegative() || window.isZero()) {
            throw new IllegalArgumentException("Invalid app.login-rate-limit configuration");
        }
    }
}
