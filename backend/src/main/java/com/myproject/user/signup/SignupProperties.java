package com.myproject.user.signup;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

/**
 * Signup attempts allowed per client address within a fixed window (successful or not).
 */
@ConfigurationProperties("app.signup-rate-limit")
public record SignupProperties(
        @DefaultValue("10") int maxAttemptsPerClient,
        @DefaultValue("1h") Duration window
) {

    public SignupProperties {
        if (maxAttemptsPerClient < 1 || window.isNegative() || window.isZero()) {
            throw new IllegalArgumentException("Invalid app.signup-rate-limit configuration");
        }
    }
}
