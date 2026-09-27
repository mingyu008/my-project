package com.myproject.common.ratelimit;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory event counter per key within a fixed time window. Thread-safe.
 * With several server instances this state must move to a shared store.
 */
public class FixedWindowCounter {

    /** Expired windows are purged when the map grows past this size. */
    private static final int CLEANUP_THRESHOLD = 10_000;

    private record Window(Instant start, int count) {
    }

    private final Duration window;
    private final Clock clock;
    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    public FixedWindowCounter(Duration window, Clock clock) {
        this.window = window;
        this.clock = clock;
    }

    /**
     * @return time until the key's window ends if it already has {@code max} events, otherwise empty
     */
    public Optional<Duration> blockedFor(String key, int max) {
        Instant now = clock.instant();
        Window w = windows.get(key);
        if (w == null || isExpired(w, now) || w.count() < max) {
            return Optional.empty();
        }
        return Optional.of(Duration.between(now, w.start().plus(window)));
    }

    public void increment(String key) {
        Instant now = clock.instant();
        windows.compute(key, (k, w) -> w == null || isExpired(w, now) ? new Window(now, 1) : new Window(w.start(), w.count() + 1));
        if (windows.size() > CLEANUP_THRESHOLD) {
            windows.values().removeIf(w -> isExpired(w, now));
        }
    }

    public void reset(String key) {
        windows.remove(key);
    }

    private boolean isExpired(Window w, Instant now) {
        return !now.isBefore(w.start().plus(window));
    }
}
