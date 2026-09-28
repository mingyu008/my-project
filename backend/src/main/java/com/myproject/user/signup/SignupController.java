package com.myproject.user.signup;

import com.myproject.auth.config.AuthModeProperties;
import com.myproject.common.web.NotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public (no login) but CSRF-protected; see SecurityConfig.
 */
@RestController
public class SignupController {

    private final SignupService signupService;
    private final SignupRateLimiter signupRateLimiter;
    private final boolean testMode;

    public SignupController(SignupService signupService, SignupRateLimiter signupRateLimiter, AuthModeProperties authMode) {
        this.signupService = signupService;
        this.signupRateLimiter = signupRateLimiter;
        this.testMode = authMode.testMode();
    }

    @PostMapping("/api/auth/signup")
    @ResponseStatus(HttpStatus.CREATED)
    public SignupResponse signup(@RequestBody SignupRequest body, HttpServletRequest request) {
        signupRateLimiter.acquire(request.getRemoteAddr());
        return testMode
                ? signupService.signupWithNickname(body.username(), body.nickname())
                : signupService.signup(body.username(), body.password());
    }

    /**
     * Test mode only: duplicate check behind the signup form's "중복 확인" buttons.
     * Outside test mode it does not exist (404), so identifiers cannot be probed without the signup rate limit.
     */
    @GetMapping("/api/auth/availability")
    public AvailabilityResponse availability(
            @RequestParam(required = false) String username,
            @RequestParam(required = false) String nickname
    ) {
        if (!testMode) {
            throw new NotFoundException();
        }
        return new AvailabilityResponse(signupService.isAvailable(username, nickname));
    }
}
