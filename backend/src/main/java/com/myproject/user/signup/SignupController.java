package com.myproject.user.signup;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public (no login) but CSRF-protected; see SecurityConfig.
 */
@RestController
public class SignupController {

    private final SignupService signupService;
    private final SignupRateLimiter signupRateLimiter;

    public SignupController(SignupService signupService, SignupRateLimiter signupRateLimiter) {
        this.signupService = signupService;
        this.signupRateLimiter = signupRateLimiter;
    }

    @PostMapping("/api/auth/signup")
    @ResponseStatus(HttpStatus.CREATED)
    public SignupResponse signup(@RequestBody SignupRequest body, HttpServletRequest request) {
        signupRateLimiter.acquire(request.getRemoteAddr());
        return signupService.signup(body.username(), body.password());
    }
}
