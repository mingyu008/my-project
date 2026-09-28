package com.myproject.user.signup;

/**
 * Body of POST /api/auth/signup. {@code username} is the requested login identifier.
 * In test mode (AuthModeProperties) {@code nickname} replaces {@code password}.
 */
public record SignupRequest(String username, String password, String nickname) {

    /**
     * Intentionally excludes password.
     */
    @Override
    public String toString() {
        return "SignupRequest{username=[omitted], password=[omitted], nickname=[omitted]}";
    }
}
