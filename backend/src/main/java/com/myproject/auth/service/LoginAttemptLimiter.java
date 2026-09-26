package com.myproject.auth.service;

import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Counts failed logins per login identifier and per client address in a fixed window.
 * <p>
 * Failures are counted whether or not the identifier exists, so being blocked reveals nothing about
 * account existence. State is in-memory: with several server instances this must move to a shared store.
 */
@Component
public class LoginAttemptLimiter {

    /** Expired windows are purged when the map grows past this size. */
    private static final int CLEANUP_THRESHOLD = 10_000;

    private record Window(Instant start, int failures) {
    }

    private final LoginRateLimitProperties properties;
    private final Clock clock;
    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    public LoginAttemptLimiter(LoginRateLimitProperties properties, Optional<Clock> clock) {
        this.properties = properties;
        this.clock = clock.orElse(Clock.systemUTC());
    }

    /**
     * @param identifierKey normalized login identifier, or null if it is not a valid identifier
     * @return time until the block ends, or empty if the attempt may proceed
     */
    public Optional<Duration> blockedFor(String identifierKey, String clientKey) {
        Instant now = clock.instant();
        Optional<Duration> byIdentifier = identifierKey == null
                ? Optional.empty()
                : remainingBlock(identifierKey(identifierKey), properties.maxFailuresPerIdentifier(), now);
        return byIdentifier.or(() -> remainingBlock(clientKey(clientKey), properties.maxFailuresPerClient(), now));
    }

    public void recordFailure(String identifierKey, String clientKey) {
        Instant now = clock.instant();
        if (identifierKey != null) {
            increment(identifierKey(identifierKey), now);
        }
        increment(clientKey(clientKey), now);
        if (windows.size() > CLEANUP_THRESHOLD) {
            windows.values().removeIf(w -> isExpired(w, now));
        }
    }

    /**
     * A successful login clears the identifier's failures (not the client's).
     */
    public void recordSuccess(String identifierKey) {
        if (identifierKey != null) {
            windows.remove(identifierKey(identifierKey));
        }
    }

    private Optional<Duration> remainingBlock(String key, int maxFailures, Instant now) {
        Window window = windows.get(key);
        if (window == null || isExpired(window, now) || window.failures() < maxFailures) {
            return Optional.empty();
        }
        return Optional.of(Duration.between(now, window.start().plus(properties.window())));
    }

    private void increment(String key, Instant now) {
        windows.compute(key, (k, w) -> w == null || isExpired(w, now) ? new Window(now, 1) : new Window(w.start(), w.failures() + 1));
    }

    private boolean isExpired(Window window, Instant now) {
        return !now.isBefore(window.start().plus(properties.window()));
    }

    private static String identifierKey(String identifier) {
        return "id:" + identifier;
    }

    private static String clientKey(String client) {
        return "client:" + client;
    }
}
