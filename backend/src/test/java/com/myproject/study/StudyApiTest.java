package com.myproject.study;

import com.jayway.jsonpath.JsonPath;
import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Set;

import static com.myproject.support.MockMvcSessions.login;
import static com.myproject.support.MockMvcSessions.withCsrf;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class StudyApiTest {

    /** 2026-09-28 19:00 in Asia/Seoul. */
    private static final Instant T0 = Instant.parse("2026-09-28T10:00:00Z");
    private static final String PASSWORD = "Study-Timer-Pass-1";

    @TestConfiguration
    static class ClockConfig {
        @Bean
        MutableClock mutableClock() {
            return new MutableClock();
        }
    }

    static class MutableClock extends Clock {
        private Instant now = T0;

        void set(Instant instant) {
            now = instant;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
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

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MutableClock clock;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private StudySessionRepository sessionRepository;

    @Autowired
    private SubjectRepository subjectRepository;

    @Autowired
    private StudyGoalRepository goalRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private MockHttpSession student;
    private MockHttpSession other;

    @BeforeEach
    void setUp() throws Exception {
        clock.set(T0);
        sessionRepository.deleteAll();
        subjectRepository.deleteAll();
        goalRepository.deleteAll();
        for (String name : new String[]{"student", "other-student"}) {
            if (!userRepository.existsByLoginIdentifier(name)) {
                userRepository.save(User.create(name, passwordEncoder.encode(PASSWORD), Set.of(Role.USER)));
            }
        }
        student = login(mockMvc, "student", PASSWORD);
        other = login(mockMvc, "other-student", PASSWORD);
    }

    private ResultActions send(MockHttpServletRequestBuilder request, MockHttpSession session, String body) throws Exception {
        MockHttpServletRequestBuilder builder = withCsrf(mockMvc, request, session);
        if (body != null) {
            builder.contentType(MediaType.APPLICATION_JSON).content(body);
        }
        return mockMvc.perform(builder);
    }

    private long subjectId(MockHttpSession session, int index) throws Exception {
        String json = mockMvc.perform(get("/api/study/subjects").session(session)).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$[" + index + "].id")).longValue();
    }

    private long start(long subjectId, String mode, Integer plannedSec) throws Exception {
        String body = "{\"subjectId\":%d,\"mode\":\"%s\"%s}".formatted(subjectId, mode,
                plannedSec == null ? "" : ",\"plannedSec\":" + plannedSec);
        String json = send(post("/api/study/sessions/start"), student, body)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    @Test
    void firstLoadCreatesDefaultSubjectsOnceAndSubjectsCanBeAdded() throws Exception {
        mockMvc.perform(get("/api/study/subjects").session(student))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].name", contains("수학", "영어", "국어", "탐구", "기타")));
        mockMvc.perform(get("/api/study/subjects").session(student))
                .andExpect(jsonPath("$.length()").value(5));

        send(post("/api/study/subjects"), student, "{\"name\":\" 한국사 \"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("한국사"));
        send(post("/api/study/subjects"), student, "{\"name\":\"한국사\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SUBJECT_NAME_TAKEN"));
        send(post("/api/study/subjects"), student, "{\"name\":\"   \"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_SUBJECT_NAME"));
    }

    @Test
    void stopwatchCountsServerTimeWithoutPausesAndStopIsIdempotent() throws Exception {
        long math = subjectId(student, 0);
        long id = start(math, "STOPWATCH", null);

        mockMvc.perform(get("/api/study/sessions/active").session(student))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.subjectName").value("수학"))
                .andExpect(jsonPath("$.startTime").value("2026-09-28T10:00:00Z"));

        clock.advance(Duration.ofMinutes(30));
        send(post("/api/study/sessions/{id}/pause", id), student, null).andExpect(jsonPath("$.pausedAt").isNotEmpty());
        clock.advance(Duration.ofMinutes(10));
        send(post("/api/study/sessions/{id}/resume", id), student, null)
                .andExpect(jsonPath("$.pausedSec").value(600));
        clock.advance(Duration.ofMinutes(5));

        send(post("/api/study/sessions/{id}/stop", id), student, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.completed").value(true))
                .andExpect(jsonPath("$.durationSec").value(35 * 60));

        // A retried stop (e.g. from the offline queue) records nothing more.
        clock.advance(Duration.ofMinutes(20));
        send(post("/api/study/sessions/{id}/stop", id), student, "{}")
                .andExpect(jsonPath("$.durationSec").value(35 * 60));

        mockMvc.perform(get("/api/study/sessions/active").session(student)).andExpect(status().isNoContent());
        mockMvc.perform(get("/api/study/summary").session(student))
                .andExpect(jsonPath("$.date").value("2026-09-28"))
                .andExpect(jsonPath("$.totalSec").value(35 * 60))
                .andExpect(jsonPath("$.goalSec").value(8 * 60 * 60))
                .andExpect(jsonPath("$.subjects[0].name").value("수학"))
                .andExpect(jsonPath("$.subjects[0].durationSec").value(35 * 60))
                .andExpect(jsonPath("$.subjects[1].durationSec").value(0));
    }

    @Test
    void queuedStopUsesThePressTimeButNeverTheFuture() throws Exception {
        long id = start(subjectId(student, 0), "STOPWATCH", null);
        clock.advance(Duration.ofMinutes(50));

        // Pressed 20 minutes after start, delivered 30 minutes later.
        send(post("/api/study/sessions/{id}/stop", id), student, "{\"endTime\":\"2026-09-28T10:20:00Z\"}")
                .andExpect(jsonPath("$.durationSec").value(20 * 60));

        long next = start(subjectId(student, 0), "STOPWATCH", null);
        clock.advance(Duration.ofMinutes(10));
        send(post("/api/study/sessions/{id}/stop", next), student, "{\"endTime\":\"2030-01-01T00:00:00Z\"}")
                .andExpect(jsonPath("$.durationSec").value(10 * 60));
    }

    @Test
    void pausedSessionStopsCountingAtThePause() throws Exception {
        long id = start(subjectId(student, 0), "STOPWATCH", null);
        clock.advance(Duration.ofMinutes(15));
        send(post("/api/study/sessions/{id}/pause", id), student, null);
        clock.advance(Duration.ofHours(2));

        send(post("/api/study/sessions/{id}/stop", id), student, null)
                .andExpect(jsonPath("$.durationSec").value(15 * 60));
    }

    @Test
    void pomodoroFocusNeverExceedsItsPlannedLength() throws Exception {
        long id = start(subjectId(student, 1), "POMODORO_FOCUS", 25 * 60);
        clock.advance(Duration.ofMinutes(40));

        send(post("/api/study/sessions/{id}/stop", id), student, null)
                .andExpect(jsonPath("$.mode").value("POMODORO_FOCUS"))
                .andExpect(jsonPath("$.durationSec").value(25 * 60));

        send(post("/api/study/sessions/start"), student, "{\"subjectId\":%d,\"mode\":\"POMODORO_FOCUS\"}".formatted(subjectId(student, 1)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PLANNED_TIME"));
    }

    @Test
    void onlyOneOpenSessionAndDiscardRecordsNothing() throws Exception {
        long math = subjectId(student, 0);
        long id = start(math, "STOPWATCH", null);

        send(post("/api/study/sessions/start"), student, "{\"subjectId\":%d,\"mode\":\"STOPWATCH\"}".formatted(math))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ACTIVE_SESSION_EXISTS"));

        clock.advance(Duration.ofMinutes(30));
        send(delete("/api/study/sessions/{id}", id), student, null).andExpect(status().isNoContent());
        mockMvc.perform(get("/api/study/summary").session(student)).andExpect(jsonPath("$.totalSec").value(0));

        send(post("/api/study/sessions/start"), student, "{\"subjectId\":%d,\"mode\":\"MANUAL\"}".formatted(math))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_MODE"));
    }

    @Test
    void manualTimeByDurationOrByPeriod() throws Exception {
        long english = subjectId(student, 1);
        long korean = subjectId(student, 2);

        send(post("/api/study/sessions/manual"), student, "{\"subjectId\":%d,\"durationSec\":1800}".formatted(english))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.mode").value("MANUAL"))
                .andExpect(jsonPath("$.recordDate").value("2026-09-28"))
                .andExpect(jsonPath("$.durationSec").value(1800));

        // 17:00-18:20 KST.
        send(post("/api/study/sessions/manual"), student,
                "{\"subjectId\":%d,\"startTime\":\"2026-09-28T08:00:00Z\",\"endTime\":\"2026-09-28T09:20:00Z\"}".formatted(korean))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.durationSec").value(80 * 60));

        mockMvc.perform(get("/api/study/summary").param("date", "2026-09-28").session(student))
                .andExpect(jsonPath("$.totalSec").value(1800 + 80 * 60))
                .andExpect(jsonPath("$.subjects[1].durationSec").value(1800))
                .andExpect(jsonPath("$.subjects[2].durationSec").value(80 * 60));
    }

    @Test
    void rejectsInvalidManualInput() throws Exception {
        long math = subjectId(student, 0);

        send(post("/api/study/sessions/manual"), student, "{\"subjectId\":%d,\"durationSec\":30}".formatted(math))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_DURATION"));
        send(post("/api/study/sessions/manual"), student, "{\"subjectId\":%d,\"durationSec\":600,\"recordDate\":\"2026-09-29\"}".formatted(math))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_RECORD_DATE"));
        send(post("/api/study/sessions/manual"), student,
                "{\"subjectId\":%d,\"startTime\":\"2026-09-28T09:00:00Z\",\"endTime\":\"2026-09-28T08:00:00Z\"}".formatted(math))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_PERIOD"));
        send(post("/api/study/sessions/manual"), student,
                "{\"subjectId\":%d,\"startTime\":\"2026-09-28T09:00:00Z\",\"endTime\":\"2026-09-28T11:00:00Z\"}".formatted(math))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_PERIOD"));

        send(post("/api/study/sessions/manual"), student, "{\"subjectId\":%d,\"durationSec\":86000}".formatted(math))
                .andExpect(status().isCreated());
        send(post("/api/study/sessions/manual"), student, "{\"subjectId\":%d,\"durationSec\":600}".formatted(math))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("DAILY_LIMIT_EXCEEDED"));
    }

    @Test
    void sessionStartedBeforeMidnightCountsForThatDay() throws Exception {
        clock.set(Instant.parse("2026-09-28T14:50:00Z")); // 23:50 KST
        long id = start(subjectId(student, 0), "STOPWATCH", null);
        clock.advance(Duration.ofMinutes(30));
        send(post("/api/study/sessions/{id}/stop", id), student, null)
                .andExpect(jsonPath("$.recordDate").value("2026-09-28"));

        mockMvc.perform(get("/api/study/summary").session(student))
                .andExpect(jsonPath("$.date").value("2026-09-29"))
                .andExpect(jsonPath("$.totalSec").value(0));
    }

    @Test
    void goalCanBeChanged() throws Exception {
        send(put("/api/study/goal"), student, "{\"dailyGoalSec\":18000}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.dailyGoalSec").value(18000));
        mockMvc.perform(get("/api/study/summary").session(student)).andExpect(jsonPath("$.goalSec").value(18000));
        mockMvc.perform(get("/api/study/summary").session(other)).andExpect(jsonPath("$.goalSec").value(8 * 60 * 60));

        send(put("/api/study/goal"), student, "{\"dailyGoalSec\":60}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_GOAL"));
    }

    @Test
    void otherUsersDataIsNotFound() throws Exception {
        long mySubject = subjectId(student, 0);
        long id = start(mySubject, "STOPWATCH", null);
        subjectId(other, 0);

        send(post("/api/study/sessions/{id}/stop", id), other, null).andExpect(status().isNotFound());
        send(delete("/api/study/sessions/{id}", id), other, null).andExpect(status().isNotFound());
        send(post("/api/study/sessions/manual"), other, "{\"subjectId\":%d,\"durationSec\":600}".formatted(mySubject))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/study/sessions/active").session(other)).andExpect(status().isNoContent());
    }

    @Test
    void requiresLogin() throws Exception {
        mockMvc.perform(get("/api/study/summary")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/study/subjects")).andExpect(status().isUnauthorized());
    }
}
