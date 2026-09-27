package com.myproject.auth.service;

import com.myproject.common.ratelimit.FixedWindowCounter;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.util.Optional;

/**
 * Counts failed logins per login identifier and per client address in a fixed window.
 * <p>
 * Failures are counted whether or not the identifier exists, so being blocked reveals nothing about
 * account existence. State is in-memory: with several server instances this must move to a shared store.
 */
@Component
public class LoginAttemptLimiter {

    private final LoginRateLimitProperties properties;
    private final FixedWindowCounter failures;

    public LoginAttemptLimiter(LoginRateLimitProperties properties, Optional<Clock> clock) {
        this.properties = properties;
        this.failures = new FixedWindowCounter(properties.window(), clock.orElse(Clock.systemUTC()));
    }

    /**
     * @param identifierKey normalized login identifier, or null if it is not a valid identifier
     * @return time until the block ends, or empty if the attempt may proceed
     */
    public Optional<Duration> blockedFor(String identifierKey, String clientKey) {
        Optional<Duration> byIdentifier = identifierKey == null
                ? Optional.empty()
                : failures.blockedFor(identifierKey(identifierKey), properties.maxFailuresPerIdentifier());
        return byIdentifier.or(() -> failures.blockedFor(clientKey(clientKey), properties.maxFailuresPerClient()));
    }

    public void recordFailure(String identifierKey, String clientKey) {
        if (identifierKey != null) {
            failures.increment(identifierKey(identifierKey));
        }
        failures.increment(clientKey(clientKey));
    }

    /**
     * A successful login clears the identifier's failures (not the client's).
     */
    public void recordSuccess(String identifierKey) {
        if (identifierKey != null) {
            failures.reset(identifierKey(identifierKey));
        }
    }

    private static String identifierKey(String identifier) {
        return "id:" + identifier;
    }

    private static String clientKey(String client) {
        return "client:" + client;
    }
}
