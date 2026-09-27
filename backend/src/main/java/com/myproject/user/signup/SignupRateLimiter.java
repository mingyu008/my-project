package com.myproject.user.signup;

import com.myproject.common.ratelimit.FixedWindowCounter;
import com.myproject.common.web.TooManyRequestsException;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.Optional;

/**
 * Limits signup attempts per client address (mass account creation, Argon2 CPU abuse, identifier probing).
 */
@Component
@EnableConfigurationProperties(SignupProperties.class)
public class SignupRateLimiter {

    private final SignupProperties properties;
    private final FixedWindowCounter attempts;

    public SignupRateLimiter(SignupProperties properties, Optional<Clock> clock) {
        this.properties = properties;
        this.attempts = new FixedWindowCounter(properties.window(), clock.orElse(Clock.systemUTC()));
    }

    /**
     * Counts this attempt, or throws if the client is over its limit.
     */
    public void acquire(String clientKey) {
        attempts.blockedFor(clientKey, properties.maxAttemptsPerClient()).ifPresent(retryAfter -> {
            throw new TooManyRequestsException("TOO_MANY_SIGNUPS", "Too many signup attempts. Try again later.", retryAfter);
        });
        attempts.increment(clientKey);
    }
}
