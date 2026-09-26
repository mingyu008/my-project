package com.myproject.auth.service;

import java.time.Duration;

public class LoginRateLimitedException extends RuntimeException {

    private final Duration retryAfter;

    public LoginRateLimitedException(Duration retryAfter) {
        super("Too many failed login attempts");
        this.retryAfter = retryAfter;
    }

    public Duration getRetryAfter() {
        return retryAfter;
    }
}
