package com.myproject.auth.web;

/**
 * Body of POST /api/auth/login. {@code username} is the user's login identifier.
 * In test mode (AuthModeProperties) only {@code nickname} is used.
 */
public record LoginRequest(String username, String password, String nickname) {

    /**
     * Intentionally excludes password.
     */
    @Override
    public String toString() {
        return "LoginRequest{username=[omitted], password=[omitted], nickname=[omitted]}";
    }
}
