package com.myproject.user.signup;

/**
 * Result of GET /api/auth/availability (test-mode duplicate check).
 */
public record AvailabilityResponse(boolean available) {
}
