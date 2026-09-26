package com.myproject.auth.web;

/**
 * Body of GET /api/auth/csrf. The client sends {@code token} back in the {@code headerName} header
 * on every state-changing request, and fetches a new one after login.
 */
public record CsrfTokenResponse(String headerName, String token) {
}
