package com.myproject.auth;

import com.myproject.auth.service.LoginAttemptLimiter;
import com.myproject.auth.service.LoginRateLimitProperties;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class LoginAttemptLimiterTest {

    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-09-26T00:00:00Z");

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private final MutableClock clock = new MutableClock();
    private final LoginAttemptLimiter limiter = new LoginAttemptLimiter(
            new LoginRateLimitProperties(3, 10, Duration.ofMinutes(15)), Optional.of(clock));

    private void fail(String id, String client, int times) {
        for (int i = 0; i < times; i++) {
            limiter.recordFailure(id, client);
        }
    }

    @Test
    void blocksIdentifierAfterMaxFailures() {
        fail("alice", "1.1.1.1", 2);
        assertThat(limiter.blockedFor("alice", "1.1.1.1")).isEmpty();

        fail("alice", "1.1.1.1", 1);
        assertThat(limiter.blockedFor("alice", "1.1.1.1")).contains(Duration.ofMinutes(15));
        // From another client too: the target account is protected.
        assertThat(limiter.blockedFor("alice", "2.2.2.2")).isPresent();
        assertThat(limiter.blockedFor("bob", "2.2.2.2")).isEmpty();
    }

    @Test
    void blockExpiresAfterWindow() {
        fail("alice", "1.1.1.1", 3);
        clock.advance(Duration.ofMinutes(10));
        assertThat(limiter.blockedFor("alice", "1.1.1.1")).contains(Duration.ofMinutes(5));

        clock.advance(Duration.ofMinutes(5));
        assertThat(limiter.blockedFor("alice", "1.1.1.1")).isEmpty();
    }

    @Test
    void blocksClientSprayingManyIdentifiers() {
        for (int i = 0; i < 10; i++) {
            limiter.recordFailure("user" + i, "6.6.6.6");
        }

        assertThat(limiter.blockedFor("someone-else", "6.6.6.6")).isPresent();
        assertThat(limiter.blockedFor("someone-else", "7.7.7.7")).isEmpty();
    }

    @Test
    void invalidIdentifiersCountOnlyAgainstClient() {
        for (int i = 0; i < 10; i++) {
            limiter.recordFailure(null, "6.6.6.6");
        }

        assertThat(limiter.blockedFor(null, "6.6.6.6")).isPresent();
    }

    @Test
    void successClearsIdentifierFailures() {
        fail("alice", "1.1.1.1", 2);
        limiter.recordSuccess("alice");
        fail("alice", "1.1.1.1", 2);

        assertThat(limiter.blockedFor("alice", "1.1.1.1")).isEmpty();
    }
}
