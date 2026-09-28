package com.myproject.study;

import com.jayway.jsonpath.JsonPath;
import com.myproject.schedule.ScheduleRewardRepository;
import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.LocalDate;
import java.util.EnumSet;

import static com.myproject.support.MockMvcSessions.login;
import static com.myproject.support.MockMvcSessions.withCsrf;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * TASK-TIMER-02: reward managers review students' study time and reward a study day.
 */
@SpringBootTest
@AutoConfigureMockMvc
class StudyReviewApiTest {

    private static final String PASSWORD = "Study-Review-Pass-1";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private StudySessionRepository sessionRepository;

    @Autowired
    private SubjectRepository subjectRepository;

    @Autowired
    private ScheduleRewardRepository rewardRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private final LocalDate today = LocalDate.now(StudyService.ZONE);

    /** minsu, jiwoo: students; teacher: CONFIRMER; admin: ADMIN. */
    private MockHttpSession minsu;
    private MockHttpSession jiwoo;
    private MockHttpSession teacher;
    private MockHttpSession admin;
    private long minsuId;
    private long jiwooId;
    private long teacherId;

    /** Other test classes share this context and delete users; leave no rows that reference them. */
    @AfterEach
    void cleanUp() {
        rewardRepository.deleteAll();
        sessionRepository.deleteAll();
        subjectRepository.deleteAll();
    }

    @BeforeEach
    void setUp() throws Exception {
        cleanUp();
        minsuId = user("minsu", "민수", Role.USER);
        jiwooId = user("jiwoo", "지우", Role.USER);
        teacherId = user("teacher", null, Role.CONFIRMER);
        user("review-admin", null, Role.ADMIN);
        minsu = login(mockMvc, "minsu", PASSWORD);
        jiwoo = login(mockMvc, "jiwoo", PASSWORD);
        teacher = login(mockMvc, "teacher", PASSWORD);
        admin = login(mockMvc, "review-admin", PASSWORD);
    }

    private long user(String loginIdentifier, String nickname, Role role) {
        return userRepository.findByLoginIdentifier(loginIdentifier).map(User::getId).orElseGet(() -> {
            User user = User.create(loginIdentifier, passwordEncoder.encode(PASSWORD), EnumSet.of(Role.USER, role));
            if (nickname != null) {
                user.assignNickname(nickname);
            }
            return userRepository.save(user).getId();
        });
    }

    private ResultActions send(MockHttpServletRequestBuilder request, MockHttpSession session, String body) throws Exception {
        return mockMvc.perform(withCsrf(mockMvc, request, session).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private long firstSubject(MockHttpSession session) throws Exception {
        String json = mockMvc.perform(get("/api/study/subjects").session(session)).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$[0].id")).longValue();
    }

    /** Hand-entered time. */
    private void manual(MockHttpSession session, int seconds) throws Exception {
        send(post("/api/study/sessions/manual"), session, "{\"subjectId\":%d,\"durationSec\":%d}".formatted(firstSubject(session), seconds))
                .andExpect(status().isCreated());
    }

    /** A stopwatch session (a few ms long) — counted as timer time. */
    private void timer(MockHttpSession session) throws Exception {
        String json = send(post("/api/study/sessions/start"), session,
                "{\"subjectId\":%d,\"mode\":\"STOPWATCH\"}".formatted(firstSubject(session)))
                .andReturn().getResponse().getContentAsString();
        long id = ((Number) JsonPath.read(json, "$.id")).longValue();
        send(post("/api/study/sessions/{id}/stop", id), session, "{}").andExpect(status().isOk());
    }

    private ResultActions reward(MockHttpSession session, long userId, LocalDate date, int points) throws Exception {
        return send(post("/api/study/review/{id}/reward", userId), session,
                "{\"date\":\"%s\",\"points\":%d,\"reason\":\"열심히 공부함\"}".formatted(date, points));
    }

    @Test
    void managersSeeEveryStudentsDayWithTimerAndManualTimeApart() throws Exception {
        manual(minsu, 3600);
        timer(minsu);
        manual(jiwoo, 7200);

        mockMvc.perform(get("/api/study/review").session(teacher))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.date").value(today.toString()))
                .andExpect(jsonPath("$.students[*].student.nickname", contains("지우", "민수")))
                .andExpect(jsonPath("$.students[1].totalSec").value(3600))
                .andExpect(jsonPath("$.students[1].manualSec").value(3600))
                .andExpect(jsonPath("$.students[1].timerSec").value(0))
                .andExpect(jsonPath("$.students[1].sessionCount").value(2))
                .andExpect(jsonPath("$.students[1].reward").value(nullValue()));

        mockMvc.perform(get("/api/study/review/{id}", minsuId).param("date", today.toString()).session(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.student.loginIdentifier").value("minsu"))
                .andExpect(jsonPath("$.sessions[*].mode", contains("MANUAL", "STOPWATCH")))
                .andExpect(jsonPath("$.sessions[0].subjectName").value("수학"));
    }

    @Test
    void studentsCannotReviewOrReward() throws Exception {
        manual(jiwoo, 600);

        mockMvc.perform(get("/api/study/review").session(minsu)).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/study/review/{id}", jiwooId).session(minsu)).andExpect(status().isForbidden());
        reward(minsu, jiwooId, today, 100).andExpect(status().isForbidden());
    }

    @Test
    void rewardsAStudyDayOnceAndItJoinsTheRewardList() throws Exception {
        manual(minsu, 5400);

        reward(teacher, minsuId, today, 300)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.source").value("STUDY"))
                .andExpect(jsonPath("$.studyDate").value(today.toString()))
                .andExpect(jsonPath("$.studySec").value(5400))
                .andExpect(jsonPath("$.scheduleId").value(nullValue()))
                .andExpect(jsonPath("$.status").value("PENDING"));

        reward(admin, minsuId, today, 100)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STUDY_REWARD_EXISTS"));

        mockMvc.perform(get("/api/study/review").session(teacher))
                .andExpect(jsonPath("$.students[0].reward.points").value(300));

        // The student sees it in their own rewards; totals include it.
        mockMvc.perform(get("/api/rewards").session(minsu))
                .andExpect(jsonPath("$.content[0].source").value("STUDY"))
                .andExpect(jsonPath("$.content[0].points").value(300));
        mockMvc.perform(get("/api/rewards/summary").session(minsu))
                .andExpect(jsonPath("$[0].pendingPoints").value(300));

        // Paying needs no schedule.
        String json = mockMvc.perform(get("/api/rewards").session(teacher)).andReturn().getResponse().getContentAsString();
        long rewardId = ((Number) JsonPath.read(json, "$.content[0].id")).longValue();
        send(post("/api/rewards/{id}/pay", rewardId), admin, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"));
    }

    @Test
    void aCancelledStudyRewardCanBeGivenAgain() throws Exception {
        manual(minsu, 600);
        String json = reward(teacher, minsuId, today, 50).andReturn().getResponse().getContentAsString();
        long rewardId = ((Number) JsonPath.read(json, "$.id")).longValue();

        send(post("/api/rewards/{id}/cancel", rewardId), teacher, "{}").andExpect(status().isOk());
        reward(teacher, minsuId, today, 80).andExpect(status().isCreated());
    }

    @Test
    void rejectsDaysWithoutStudySelfRewardsAndMovingARecipient() throws Exception {
        reward(teacher, minsuId, today, 100)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("NO_STUDY_TIME"));
        reward(teacher, minsuId, today.plusDays(1), 100)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_RECORD_DATE"));
        send(post("/api/study/review/{id}/reward", minsuId), teacher, "{\"date\":\"%s\",\"points\":0,\"reason\":\"x\"}".formatted(today))
                .andExpect(status().isBadRequest());

        manual(teacher, 600);
        reward(teacher, teacherId, today, 100)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("SELF_REWARD_NOT_ALLOWED"));

        manual(minsu, 600);
        String json = reward(teacher, minsuId, today, 100).andReturn().getResponse().getContentAsString();
        long rewardId = ((Number) JsonPath.read(json, "$.id")).longValue();
        send(put("/api/rewards/{id}", rewardId), teacher,
                "{\"recipientId\":%d,\"points\":100,\"reason\":\"x\",\"version\":0}".formatted(jiwooId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_RECIPIENT"));
        send(put("/api/rewards/{id}", rewardId), teacher,
                "{\"recipientId\":%d,\"points\":150,\"reason\":\"더 잘함\",\"version\":0}".formatted(minsuId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.points").value(150));
    }
}
