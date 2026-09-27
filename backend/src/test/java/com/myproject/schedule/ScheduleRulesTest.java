package com.myproject.schedule;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class ScheduleRulesTest {

    private static final LocalDateTime T = LocalDateTime.of(2026, 9, 28, 10, 0);

    @Test
    void periodAllowsEqualStartAndEndButNotEndBeforeStart() {
        assertThat(Schedule.isValidPeriod(T, T.plusMinutes(1))).isTrue();
        assertThat(Schedule.isValidPeriod(T, T)).isTrue();
        assertThat(Schedule.isValidPeriod(T, T.minusSeconds(1))).isFalse();
        assertThat(Schedule.isValidPeriod(null, T)).isFalse();
        assertThat(Schedule.isValidPeriod(T, null)).isFalse();
    }

    @ParameterizedTest
    @CsvSource({
            "PLANNED, PLANNED, true",
            "PLANNED, IN_PROGRESS, true",
            "PLANNED, CANCELLED, true",
            "PLANNED, COMPLETED, false",
            "IN_PROGRESS, COMPLETED, true",
            "IN_PROGRESS, CANCELLED, true",
            "IN_PROGRESS, PLANNED, false",
            "COMPLETED, IN_PROGRESS, false",
            "COMPLETED, COMPLETED, true",
            "CANCELLED, PLANNED, false",
    })
    void statusTransitions(ScheduleStatus from, ScheduleStatus to, boolean allowed) {
        assertThat(from.canChangeTo(to)).isEqualTo(allowed);
    }

    @Test
    void likeWildcardsAreEscaped() {
        assertThat(ScheduleSpecifications.escapeLike("100%_a\\b")).isEqualTo("100\\%\\_a\\\\b");
    }
}
