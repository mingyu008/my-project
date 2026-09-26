package com.myproject.common.web;

/**
 * Error body for API responses. {@code code} is stable for clients; {@code message} is for humans
 * and must never contain internal details (user existence, account status, stack traces).
 */
public record ErrorResponse(String code, String message) {

    public static final ErrorResponse UNAUTHENTICATED =
            new ErrorResponse("UNAUTHENTICATED", "Authentication required");
    public static final ErrorResponse FORBIDDEN =
            new ErrorResponse("FORBIDDEN", "Access denied");
    public static final ErrorResponse CSRF_INVALID =
            new ErrorResponse("CSRF_INVALID", "Missing or invalid CSRF token");
}
