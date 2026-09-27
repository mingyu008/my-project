package com.myproject.schedule;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jayway.jsonpath.JsonPath;
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

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

import static com.myproject.support.MockMvcSessions.login;
import static com.myproject.support.MockMvcSessions.withCsrf;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class RewardApiTest {

    private static final String PASSWORD = "Correct-Horse-9!";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ScheduleRepository scheduleRepository;

    @Autowired
    private ScheduleRewardRepository rewardRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    /** alice: schedule creator, bob: assignee, carol: CONFIRMER, dave: unrelated user. */
    private MockHttpSession alice;
    private MockHttpSession bob;
    private MockHttpSession carol;
    private MockHttpSession dave;
    private MockHttpSession admin;
    private long bobId;
    private long carolId;
    private long inactiveId;

    @BeforeEach
    void setUp() throws Exception {
        cleanUp();
        userRepository.deleteAll();
        userRepository.save(User.create("alice", passwordEncoder.encode(PASSWORD), Set.of(Role.USER)));
        bobId = userRepository.save(User.create("bob", passwordEncoder.encode(PASSWORD), Set.of(Role.USER))).getId();
        carolId = userRepository.save(User.create("carol", passwordEncoder.encode(PASSWORD), Set.of(Role.USER, Role.CONFIRMER))).getId();
        userRepository.save(User.create("dave", passwordEncoder.encode(PASSWORD), Set.of(Role.USER)));
        userRepository.save(User.create("admin", passwordEncoder.encode(PASSWORD), Set.of(Role.USER, Role.ADMIN)));
        User inactive = User.create("inactive", passwordEncoder.encode(PASSWORD), Set.of(Role.USER));
        inactive.deactivate();
        inactiveId = userRepository.save(inactive).getId();
        alice = login(mockMvc, "alice", PASSWORD);
        bob = login(mockMvc, "bob", PASSWORD);
        carol = login(mockMvc, "carol", PASSWORD);
        dave = login(mockMvc, "dave", PASSWORD);
        admin = login(mockMvc, "admin", PASSWORD);
    }

    /** Other test classes in this context delete users; rewards and schedules reference users. */
    @AfterEach
    void cleanUp() {
        rewardRepository.deleteAllInBatch();
        scheduleRepository.deleteAllInBatch();
    }

    private ResultActions send(MockHttpServletRequestBuilder request, MockHttpSession session, Object json) throws Exception {
        MockHttpServletRequestBuilder builder = withCsrf(mockMvc, request, session);
        if (json != null) {
            builder.contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(json));
        }
        return mockMvc.perform(builder);
    }

    /** alice's private schedule assigned to bob. */
    private long schedule(String status) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "Release");
        body.put("startAt", "2026-09-28T10:00:00");
        body.put("endAt", "2026-09-28T11:00:00");
        body.put("status", status);
        body.put("priority", "NORMAL");
        body.put("assigneeId", bobId);
        body.put("isPublic", false);
        String response = send(post("/api/schedules"), alice, body).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(response, "$.id")).longValue();
    }

    private static Map<String, Object> reward(long recipientId, Object points, String reason) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("recipientId", recipientId);
        body.put("points", points);
        body.put("reason", reason);
        return body;
    }

    private long createReward(MockHttpSession session, long scheduleId, long recipientId, int points) throws Exception {
        String response = send(post("/api/schedules/{id}/rewards", scheduleId), session, reward(recipientId, points, "done"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(response, "$.id")).longValue();
    }

    // --- Access ---

    @Test
    void anonymousAndCsrf() throws Exception {
        mockMvc.perform(get("/api/rewards")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/rewards/summary")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/schedules/1/rewards")).andExpect(status().isUnauthorized());
        long id = schedule("COMPLETED");
        mockMvc.perform(post("/api/schedules/{id}/rewards", id).session(carol).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(reward(bobId, 10, "x"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
        assertThat(rewardRepository.count()).isZero();
    }

    @Test
    void confirmerSeesEverySchedule() throws Exception {
        long id = schedule("PLANNED");

        mockMvc.perform(get("/api/schedules/{id}", id).session(dave)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/schedules/{id}", id).session(carol))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.editable").value(false));
        mockMvc.perform(get("/api/schedules").session(carol)).andExpect(jsonPath("$.totalElements").value(1));
        // Reading is not editing.
        send(delete("/api/schedules/{id}", id), carol, null).andExpect(status().isForbidden());
    }

    // --- Create ---

    @Test
    void confirmerAddsRewardToCompletedSchedule() throws Exception {
        long id = schedule("COMPLETED");

        send(post("/api/schedules/{id}/rewards", id), carol, reward(bobId, 150, "  On time  "))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", matchesPattern("/api/rewards/\\d+")))
                .andExpect(jsonPath("$.scheduleId").value(id))
                .andExpect(jsonPath("$.scheduleTitle").value("Release"))
                .andExpect(jsonPath("$.recipient.loginIdentifier").value("bob"))
                .andExpect(jsonPath("$.points").value(150))
                .andExpect(jsonPath("$.reason").value("On time"))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.createdBy.loginIdentifier").value("carol"))
                .andExpect(jsonPath("$.paidAt").doesNotExist())
                .andExpect(jsonPath("$.manageable").value(true));
    }

    @Test
    void rewardsNeedACompletedSchedule() throws Exception {
        for (String status : new String[]{"PLANNED", "IN_PROGRESS", "CANCELLED"}) {
            long id = schedule(status);
            send(post("/api/schedules/{id}/rewards", id), carol, reward(bobId, 10, "x"))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("SCHEDULE_NOT_COMPLETED"));
        }
        assertThat(rewardRepository.count()).isZero();
    }

    @Test
    void onlyRewardManagersCanAdd() throws Exception {
        long id = schedule("COMPLETED");
        for (MockHttpSession user : new MockHttpSession[]{alice, bob, dave}) {
            send(post("/api/schedules/{id}/rewards", id), user, reward(carolId, 10, "x"))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        }
        send(post("/api/schedules/{id}/rewards", id), admin, reward(bobId, 10, "x")).andExpect(status().isCreated());
    }

    @Test
    void rejectsInvalidRewardInput() throws Exception {
        long id = schedule("COMPLETED");
        send(post("/api/schedules/{id}/rewards", id), carol, reward(bobId, 0, "x")).andExpect(status().isBadRequest());
        send(post("/api/schedules/{id}/rewards", id), carol, reward(bobId, ScheduleReward.MAX_POINTS + 1, "x"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid field: points"));
        send(post("/api/schedules/{id}/rewards", id), carol, reward(bobId, 10, " ")).andExpect(status().isBadRequest());
        send(post("/api/schedules/{id}/rewards", id), carol, reward(bobId, 10, "x".repeat(ScheduleReward.REASON_MAX_LENGTH + 1)))
                .andExpect(status().isBadRequest());
        send(post("/api/schedules/{id}/rewards", id), carol, reward(inactiveId, 10, "x"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_RECIPIENT"));
        send(post("/api/schedules/{id}/rewards", id), carol, reward(999_999, 10, "x"))
                .andExpect(jsonPath("$.code").value("INVALID_RECIPIENT"));
        send(post("/api/schedules/{id}/rewards", 999_999), carol, reward(bobId, 10, "x")).andExpect(status().isNotFound());
        assertThat(rewardRepository.count()).isZero();
    }

    @Test
    void reasonIsStoredVerbatimAsPlainText() throws Exception {
        String html = "<script>alert(1)</script>";
        long id = schedule("COMPLETED");
        send(post("/api/schedules/{id}/rewards", id), carol, reward(bobId, 10, html))
                .andExpect(jsonPath("$.reason").value(html));
    }

    @Test
    void managersNeverHandleTheirOwnReward() throws Exception {
        long id = schedule("COMPLETED");
        send(post("/api/schedules/{id}/rewards", id), carol, reward(carolId, 10, "me"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("SELF_REWARD_NOT_ALLOWED"));

        long rewardId = createReward(admin, id, carolId, 10);
        mockMvc.perform(get("/api/schedules/{id}/rewards", id).session(carol))
                .andExpect(jsonPath("$.items[0].manageable").value(false));
        send(post("/api/rewards/{id}/pay", rewardId), carol, null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("SELF_REWARD_NOT_ALLOWED"));
        send(put("/api/rewards/{id}", rewardId), carol, with(reward(bobId, 10, "x"), "version", 0))
                .andExpect(jsonPath("$.code").value("SELF_REWARD_NOT_ALLOWED"));
        send(post("/api/rewards/{id}/pay", rewardId), admin, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"));
    }

    // --- Read ---

    @Test
    void scheduleRewardsAreFilteredByRole() throws Exception {
        long id = schedule("COMPLETED");
        createReward(carol, id, bobId, 100);
        createReward(admin, id, carolId, 20);

        mockMvc.perform(get("/api/schedules/{id}/rewards", id).session(carol))
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.canManage").value(true));
        mockMvc.perform(get("/api/schedules/{id}/rewards", id).session(bob))
                .andExpect(jsonPath("$.items[*].recipient.loginIdentifier", contains("bob")))
                .andExpect(jsonPath("$.items[0].manageable").value(false))
                .andExpect(jsonPath("$.canManage").value(false));
        // The creator sees the schedule but receives nothing.
        mockMvc.perform(get("/api/schedules/{id}/rewards", id).session(alice))
                .andExpect(jsonPath("$.items", hasSize(0)));
        mockMvc.perform(get("/api/schedules/{id}/rewards", id).session(dave)).andExpect(status().isNotFound());
    }

    @Test
    void canManageIsFalseUntilTheScheduleIsCompleted() throws Exception {
        long id = schedule("IN_PROGRESS");
        mockMvc.perform(get("/api/schedules/{id}/rewards", id).session(carol)).andExpect(jsonPath("$.canManage").value(false));
    }

    @Test
    void listAndSummaryShowOnlyOwnRewardsToUsers() throws Exception {
        long id = schedule("COMPLETED");
        long paid = createReward(carol, id, bobId, 100);
        createReward(carol, id, bobId, 30);
        long cancelled = createReward(carol, id, bobId, 999);
        createReward(admin, id, carolId, 20);
        send(post("/api/rewards/{id}/pay", paid), carol, null).andExpect(status().isOk());
        send(post("/api/rewards/{id}/cancel", cancelled), carol, null).andExpect(status().isOk());

        mockMvc.perform(get("/api/rewards").session(carol))
                .andExpect(jsonPath("$.totalElements").value(4))
                .andExpect(jsonPath("$.content[0].recipient.loginIdentifier").value("carol"));
        mockMvc.perform(get("/api/rewards?status=PAID").session(carol))
                .andExpect(jsonPath("$.content[*].points", contains(100)));
        mockMvc.perform(get("/api/rewards?recipientId=" + carolId).session(admin))
                .andExpect(jsonPath("$.content[*].points", contains(20)));
        // bob asks for carol's rewards and still gets only his own.
        mockMvc.perform(get("/api/rewards?recipientId=" + carolId).session(bob))
                .andExpect(jsonPath("$.totalElements").value(3));
        mockMvc.perform(get("/api/rewards").session(dave)).andExpect(jsonPath("$.totalElements").value(0));
        mockMvc.perform(get("/api/rewards?size=101").session(carol)).andExpect(status().isBadRequest());

        mockMvc.perform(get("/api/rewards/summary").session(carol))
                .andExpect(jsonPath("$[*].recipient.loginIdentifier", contains("bob", "carol")))
                .andExpect(jsonPath("$[0].pendingPoints").value(30))
                .andExpect(jsonPath("$[0].paidPoints").value(100))
                .andExpect(jsonPath("$[0].paidCount").value(1))
                .andExpect(jsonPath("$[1].pendingPoints").value(20));
        mockMvc.perform(get("/api/rewards/summary").session(bob))
                .andExpect(jsonPath("$[*].recipient.loginIdentifier", contains("bob")));
        mockMvc.perform(get("/api/rewards/summary").session(dave)).andExpect(jsonPath("$", hasSize(0)));
    }

    // --- Update / pay / cancel ---

    private static Map<String, Object> with(Map<String, Object> body, String key, Object value) {
        Map<String, Object> copy = new LinkedHashMap<>(body);
        copy.put(key, value);
        return copy;
    }

    @Test
    void updateUsesOptimisticLocking() throws Exception {
        long id = schedule("COMPLETED");
        long rewardId = createReward(carol, id, bobId, 100);

        send(put("/api/rewards/{id}", rewardId), carol, with(reward(bobId, 120, "better"), "version", 0))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.points").value(120))
                .andExpect(jsonPath("$.version").value(1));
        send(put("/api/rewards/{id}", rewardId), carol, with(reward(bobId, 1, "stale"), "version", 0))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REWARD_VERSION_CONFLICT"));
        send(put("/api/rewards/{id}", rewardId), carol, reward(bobId, 1, "no version")).andExpect(status().isBadRequest());
        send(put("/api/rewards/{id}", rewardId), bob, with(reward(bobId, 1, "x"), "version", 1)).andExpect(status().isForbidden());
        send(put("/api/rewards/{id}", 999_999), carol, with(reward(bobId, 1, "x"), "version", 0)).andExpect(status().isNotFound());
    }

    @Test
    void paidAndCancelledRewardsAreFinal() throws Exception {
        long id = schedule("COMPLETED");
        long rewardId = createReward(carol, id, bobId, 100);

        send(post("/api/rewards/{id}/pay", rewardId), bob, null).andExpect(status().isForbidden());
        send(post("/api/rewards/{id}/pay", rewardId), carol, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"))
                .andExpect(jsonPath("$.paidAt", notNullValue()))
                .andExpect(jsonPath("$.updatedBy.loginIdentifier").value("carol"))
                .andExpect(jsonPath("$.manageable").value(false));
        send(post("/api/rewards/{id}/pay", rewardId), carol, null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REWARD_NOT_PENDING"));
        send(post("/api/rewards/{id}/cancel", rewardId), carol, null).andExpect(status().isConflict());
        send(put("/api/rewards/{id}", rewardId), carol, with(reward(bobId, 1, "x"), "version", 1)).andExpect(status().isConflict());

        long other = createReward(carol, id, bobId, 5);
        send(post("/api/rewards/{id}/cancel", other), carol, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        send(post("/api/rewards/{id}/pay", other), carol, null).andExpect(status().isConflict());
    }

    @Test
    void payingNeedsTheScheduleToStillBeCompleted() throws Exception {
        long id = schedule("COMPLETED");
        long reopened = createReward(carol, id, bobId, 10);
        // ADMIN may force a status back (D-032).
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "Release");
        body.put("startAt", "2026-09-28T10:00:00");
        body.put("endAt", "2026-09-28T11:00:00");
        body.put("status", "IN_PROGRESS");
        body.put("priority", "NORMAL");
        body.put("assigneeId", bobId);
        body.put("isPublic", false);
        body.put("version", 0);
        send(put("/api/schedules/{id}", id), admin, body).andExpect(status().isOk());

        send(post("/api/rewards/{id}/pay", reopened), carol, null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SCHEDULE_NOT_COMPLETED"));

        long deletedScheduleId = schedule("COMPLETED");
        long orphan = createReward(carol, deletedScheduleId, bobId, 10);
        send(delete("/api/schedules/{id}", deletedScheduleId), alice, null).andExpect(status().isNoContent());
        send(post("/api/rewards/{id}/pay", orphan), carol, null).andExpect(jsonPath("$.code").value("SCHEDULE_NOT_COMPLETED"));
        // Still in the history and can be cancelled.
        mockMvc.perform(get("/api/rewards").session(bob)).andExpect(jsonPath("$.totalElements").value(2));
        send(post("/api/rewards/{id}/cancel", orphan), carol, null).andExpect(status().isOk());
    }
}
