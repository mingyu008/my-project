package com.myproject.user.signup;

/**
 * Body of POST /api/auth/signup. {@code username} is the requested login identifier.
 */
public record SignupRequest(String username, String password) {

    /**
     * Intentionally excludes password.
     */
    @Override
    public String toString() {
        return "SignupRequest{username=[omitted], password=[omitted]}";
    }
}
