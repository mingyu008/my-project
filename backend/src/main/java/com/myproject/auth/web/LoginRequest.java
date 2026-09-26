package com.myproject.auth.web;

/**
 * Body of POST /api/auth/login. {@code username} is the user's login identifier.
 */
public record LoginRequest(String username, String password) {

    /**
     * Intentionally excludes password.
     */
    @Override
    public String toString() {
        return "LoginRequest{username=[omitted], password=[omitted]}";
    }
}
