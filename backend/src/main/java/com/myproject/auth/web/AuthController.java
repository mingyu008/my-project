package com.myproject.auth.web;

import com.myproject.auth.service.AuthService;
import com.myproject.auth.service.AuthenticatedUser;
import com.myproject.auth.service.AuthenticationFailedException;
import com.myproject.auth.service.LoginAttemptLimiter;
import com.myproject.auth.service.LoginRateLimitedException;
import com.myproject.common.web.ErrorResponse;
import com.myproject.security.SessionAuthentication;
import com.myproject.user.domain.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private static final ErrorResponse AUTHENTICATION_FAILED =
            new ErrorResponse("AUTHENTICATION_FAILED", AuthenticationFailedException.MESSAGE);
    private static final ErrorResponse TOO_MANY_ATTEMPTS =
            new ErrorResponse("TOO_MANY_ATTEMPTS", "Too many failed login attempts. Try again later.");

    private final AuthService authService;
    private final LoginAttemptLimiter loginAttemptLimiter;
    private final SessionAuthenticationStrategy sessionAuthenticationStrategy;
    private final SecurityContextRepository securityContextRepository;
    private final SecurityContextHolderStrategy securityContextHolderStrategy =
            SecurityContextHolder.getContextHolderStrategy();

    public AuthController(
            AuthService authService,
            LoginAttemptLimiter loginAttemptLimiter,
            SessionAuthenticationStrategy sessionAuthenticationStrategy,
            SecurityContextRepository securityContextRepository
    ) {
        this.authService = authService;
        this.loginAttemptLimiter = loginAttemptLimiter;
        this.sessionAuthenticationStrategy = sessionAuthenticationStrategy;
        this.securityContextRepository = securityContextRepository;
    }

    /**
     * Issues the CSRF token for the current session (creating the session if needed).
     */
    @GetMapping("/csrf")
    public CsrfTokenResponse csrf(CsrfToken csrfToken) {
        return new CsrfTokenResponse(csrfToken.getHeaderName(), csrfToken.getToken());
    }

    /**
     * Authenticates and stores the SecurityContext in the HttpSession.
     * The session ID and the CSRF token both change on success; the client must call
     * GET /api/auth/csrf again before its next state-changing request.
     */
    @PostMapping("/login")
    public AuthenticatedUserResponse login(
            @RequestBody LoginRequest loginRequest,
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        String identifierKey = rateLimitKey(loginRequest.username());
        String clientKey = request.getRemoteAddr();
        // Checked before hashing so that blocked attempts cost no Argon2 work.
        loginAttemptLimiter.blockedFor(identifierKey, clientKey).ifPresent(retryAfter -> {
            log.warn("Login blocked by rate limit");
            throw new LoginRateLimitedException(retryAfter);
        });

        AuthenticatedUser user;
        try {
            user = authService.authenticate(loginRequest.username(), loginRequest.password());
        } catch (AuthenticationFailedException e) {
            loginAttemptLimiter.recordFailure(identifierKey, clientKey);
            throw e;
        }
        loginAttemptLimiter.recordSuccess(identifierKey);

        Authentication authentication = SessionAuthentication.of(user);
        sessionAuthenticationStrategy.onAuthentication(authentication, request, response);

        SecurityContext context = securityContextHolderStrategy.createEmptyContext();
        context.setAuthentication(authentication);
        securityContextHolderStrategy.setContext(context);
        securityContextRepository.saveContext(context, request, response);

        return AuthenticatedUserResponse.from(user);
    }

    /**
     * Current session's user. Unauthenticated requests get 401 from the security filter chain.
     */
    @GetMapping("/me")
    public AuthenticatedUserResponse me(@AuthenticationPrincipal AuthenticatedUser user) {
        return AuthenticatedUserResponse.from(user);
    }

    @ExceptionHandler(AuthenticationFailedException.class)
    public ResponseEntity<ErrorResponse> handleAuthenticationFailed() {
        // The failure reason is logged by AuthService and never returned.
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(AUTHENTICATION_FAILED);
    }

    @ExceptionHandler(LoginRateLimitedException.class)
    public ResponseEntity<ErrorResponse> handleRateLimited(LoginRateLimitedException e) {
        long seconds = Math.max(1, e.getRetryAfter().plus(Duration.ofMillis(999)).toSeconds());
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(seconds))
                .body(TOO_MANY_ATTEMPTS);
    }

    /**
     * Same normalization as lookup, so "Alice" and "alice" share one counter. Null for invalid identifiers
     * (those are limited per client only).
     */
    private static String rateLimitKey(String loginIdentifier) {
        try {
            return User.normalizeLoginIdentifier(loginIdentifier);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
