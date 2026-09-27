package com.myproject.common.web;

import java.time.Duration;

public class TooManyRequestsException extends RuntimeException {

    private final String code;
    private final Duration retryAfter;

    public TooManyRequestsException(String code, String message, Duration retryAfter) {
        super(message);
        this.code = code;
        this.retryAfter = retryAfter;
    }

    public String getCode() {
        return code;
    }

    public Duration getRetryAfter() {
        return retryAfter;
    }
}
