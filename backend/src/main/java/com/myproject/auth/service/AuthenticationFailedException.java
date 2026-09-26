package com.myproject.auth.service;

/**
 * Thrown for every authentication failure.
 * <p>
 * The message is identical for all causes so that callers cannot reveal whether a user exists
 * or is inactive. {@link #getReason()} is for internal logging/auditing only and must never be
 * sent to the client.
 */
public class AuthenticationFailedException extends RuntimeException {

    public static final String MESSAGE = "Invalid login identifier or password";

    public enum Reason {
        INVALID_INPUT,
        USER_NOT_FOUND,
        BAD_CREDENTIALS,
        INACTIVE,
        UNREADABLE_PASSWORD_HASH
    }

    private final Reason reason;

    AuthenticationFailedException(Reason reason) {
        super(MESSAGE);
        this.reason = reason;
    }

    public Reason getReason() {
        return reason;
    }
}
