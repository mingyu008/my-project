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
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.myproject.support.MockMvcSessions.login;
import static com.myproject.support.MockMvcSessions.withCsrf;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ScheduleApiTest {

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
    private PasswordEncoder passwordEncoder;

    private MockHttpSession alice;
    private MockHttpSession bob;
    private MockHttpSession admin;
    private long aliceId;
    private long bobId;
    private long inactiveId;

    @BeforeEach
    void setUp() throws Exception {
        scheduleRepository.deleteAllInBatch();
        userRepository.deleteAll();
        aliceId = userRepository.save(User.create("alice", passwordEncoder.encode(PASSWORD), Set.of(Role.USER))).getId();
        bobId = userRepository.save(User.create("bob", passwordEncoder.encode(PASSWORD), Set.of(Role.USER))).getId();
        userRepository.save(User.create("admin", passwordEncoder.encode(PASSWORD), Set.of(Role.USER, Role.ADMIN)));
        User inactive = User.create("inactive", passwordEncoder.encode(PASSWORD), Set.of(Role.USER));
        inactive.deactivate();
        inactiveId = userRepository.save(inactive).getId();
        alice = login(mockMvc, "alice", PASSWORD);
        bob = login(mockMvc, "bob", PASSWORD);
        admin = login(mockMvc, "admin", PASSWORD);
    }

    /** Other test classes in this context delete users; schedules (including soft-deleted rows) reference users. */
    @AfterEach
    void tearDown() {
        scheduleRepository.deleteAllInBatch();
    }

    private static Map<String, Object> body(String title, String startAt, String endAt) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", title);
        body.put("description", "desc");
        body.put("startAt", startAt);
        body.put("endAt", endAt);
        body.put("status", "PLANNED");
        body.put("priority", "NORMAL");
        body.put("assigneeId", null);
        body.put("location", "Room A");
        body.put("isPublic", false);
        body.put("color", "#3788d8");
        return body;
    }

    private static Map<String, Object> body(String title) {
        return body(title, "2026-09-28T10:00:00", "2026-09-28T11:00:00");
    }

    private static Map<String, Object> with(Map<String, Object> body, String key, Object value) {
        Map<String, Object> copy = new LinkedHashMap<>(body);
        copy.put(key, value);
        return copy;
    }

    private ResultActions send(MockHttpServletRequestBuilder request, MockHttpSession session, Object json) throws Exception {
        MockHttpServletRequestBuilder builder = withCsrf(mockMvc, request, session);
        if (json != null) {
            builder.contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(json));
        }
        return mockMvc.perform(builder);
    }

    private long create(MockHttpSession session, Map<String, Object> body) throws Exception {
        String response = send(post("/api/schedules"), session, body)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(response, "$.id")).longValue();
    }

    private long version(MockHttpSession session, long id) throws Exception {
        String response = mockMvc.perform(get("/api/schedules/{id}", id).session(session))
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(response, "$.version")).longValue();
    }

    // --- Access ---

    @Test
    void anonymousCannotAccess() throws Exception {
        mockMvc.perform(get("/api/schedules")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/schedules/1")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/schedules/assignees")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/schedules/conflicts?assigneeId=1&startAt=2026-09-28T10:00:00&endAt=2026-09-28T11:00:00"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void writingRequiresCsrfToken() throws Exception {
        mockMvc.perform(post("/api/schedules").session(alice).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body("t"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
        assertThat(scheduleRepository.count()).isZero();
    }

    // --- Create / read ---

    @Test
    void createRecordsAuditFieldsFromTheSessionNotTheClient() throws Exception {
        Map<String, Object> request = with(with(body("  Weekly meeting  "), "assigneeId", bobId), "createdBy", Map.of("id", bobId));
        send(post("/api/schedules"), alice, with(request, "createdAt", "2000-01-01T00:00:00Z"))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", matchesPattern("/api/schedules/\\d+")))
                .andExpect(jsonPath("$.title").value("Weekly meeting"))
                .andExpect(jsonPath("$.startAt").value("2026-09-28T10:00:00"))
                .andExpect(jsonPath("$.endAt").value("2026-09-28T11:00:00"))
                .andExpect(jsonPath("$.status").value("PLANNED"))
                .andExpect(jsonPath("$.priority").value("NORMAL"))
                .andExpect(jsonPath("$.assignee.loginIdentifier").value("bob"))
                .andExpect(jsonPath("$.isPublic").value(false))
                .andExpect(jsonPath("$.createdBy.loginIdentifier").value("alice"))
                .andExpect(jsonPath("$.updatedBy.loginIdentifier").value("alice"))
                .andExpect(jsonPath("$.createdAt").value(matchesPattern("20[2-9]\\d-.*")))
                .andExpect(jsonPath("$.version").value(0))
                .andExpect(jsonPath("$.editable").value(true));
    }

    @Test
    void startEqualToEndIsAllowed() throws Exception {
        send(post("/api/schedules"), alice, body("instant", "2026-09-28T10:00:00", "2026-09-28T10:00:00"))
                .andExpect(status().isCreated());
    }

    @Test
    void textIsStoredVerbatimAsPlainText() throws Exception {
        String html = "<script>alert('x')</script><img src=x onerror=alert(1)>";
        long id = create(alice, with(with(body(html), "description", html), "location", html));

        mockMvc.perform(get("/api/schedules/{id}", id).session(alice))
                .andExpect(jsonPath("$.title").value(html))
                .andExpect(jsonPath("$.description").value(html))
                .andExpect(jsonPath("$.location").value(html));
    }

    @Test
    void rejectsInvalidInput() throws Exception {
        send(post("/api/schedules"), alice, with(body("t"), "title", " "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.message").value("Invalid field: title"));
        send(post("/api/schedules"), alice, with(body("t"), "title", "x".repeat(Schedule.TITLE_MAX_LENGTH + 1)))
                .andExpect(status().isBadRequest());
        send(post("/api/schedules"), alice, with(body("t"), "startAt", null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid field: startAt"));
        send(post("/api/schedules"), alice, with(body("t"), "endAt", null)).andExpect(status().isBadRequest());
        send(post("/api/schedules"), alice, with(body("t"), "isPublic", null)).andExpect(status().isBadRequest());
        send(post("/api/schedules"), alice, with(body("t"), "color", "red;background:url(x)"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid field: color"));
        send(post("/api/schedules"), alice, with(body("t"), "status", "DONE"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
        send(post("/api/schedules"), alice, with(body("t"), "startAt", "not-a-date"))
                .andExpect(status().isBadRequest());
        assertThat(scheduleRepository.count()).isZero();
    }

    @Test
    void rejectsEndBeforeStart() throws Exception {
        send(post("/api/schedules"), alice, body("t", "2026-09-28T11:00:00", "2026-09-28T10:59:59"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_SCHEDULE_PERIOD"));
        assertThat(scheduleRepository.count()).isZero();
    }

    @Test
    void assigneeMustBeAnActiveUser() throws Exception {
        send(post("/api/schedules"), alice, with(body("t"), "assigneeId", inactiveId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_ASSIGNEE"));
        send(post("/api/schedules"), alice, with(body("t"), "assigneeId", 999_999))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_ASSIGNEE"));
    }

    @Test
    void assigneesListsActiveUsersOnly() throws Exception {
        mockMvc.perform(get("/api/schedules/assignees").session(bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].loginIdentifier", contains("admin", "alice", "bob")))
                .andExpect(jsonPath("$[0].passwordHash").doesNotExist())
                .andExpect(jsonPath("$[0].roles").doesNotExist());
    }

    @Test
    void unknownOrInvalidIds() throws Exception {
        mockMvc.perform(get("/api/schedules/999999").session(alice))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
        mockMvc.perform(get("/api/schedules/abc").session(alice)).andExpect(status().isBadRequest());
        send(put("/api/schedules/{id}", 999_999), alice, with(body("t"), "version", 0)).andExpect(status().isNotFound());
        send(delete("/api/schedules/{id}", 999_999), alice, null).andExpect(status().isNotFound());
    }

    // --- Visibility and ownership ---

    @Test
    void privateScheduleIsHiddenFromOtherUsers() throws Exception {
        long id = create(alice, body("alice private"));

        mockMvc.perform(get("/api/schedules/{id}", id).session(bob)).andExpect(status().isNotFound());
        send(put("/api/schedules/{id}", id), bob, with(body("hacked"), "version", 0)).andExpect(status().isNotFound());
        send(delete("/api/schedules/{id}", id), bob, null).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/schedules").session(bob)).andExpect(jsonPath("$.content", hasSize(0)));

        mockMvc.perform(get("/api/schedules/{id}", id).session(alice)).andExpect(jsonPath("$.title").value("alice private"));
        assertThat(scheduleRepository.findById(id)).get().extracting(Schedule::isDeleted).isEqualTo(false);
    }

    @Test
    void publicAndAssignedSchedulesAreReadOnlyForOthers() throws Exception {
        long publicId = create(alice, with(body("public"), "isPublic", true));
        long assignedId = create(alice, with(body("for bob"), "assigneeId", bobId));

        mockMvc.perform(get("/api/schedules").session(bob))
                .andExpect(jsonPath("$.totalElements").value(2));
        for (long id : List.of(publicId, assignedId)) {
            mockMvc.perform(get("/api/schedules/{id}", id).session(bob))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.editable").value(false));
            send(put("/api/schedules/{id}", id), bob, with(body("hacked"), "version", 0))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("FORBIDDEN"));
            send(delete("/api/schedules/{id}", id), bob, null).andExpect(status().isForbidden());
        }
        mockMvc.perform(get("/api/schedules/{id}", publicId).session(alice)).andExpect(jsonPath("$.title").value("public"));
    }

    @Test
    void adminSeesAndManagesEverything() throws Exception {
        long id = create(alice, body("alice private"));

        mockMvc.perform(get("/api/schedules").session(admin)).andExpect(jsonPath("$.totalElements").value(1));
        mockMvc.perform(get("/api/schedules/{id}", id).session(admin)).andExpect(jsonPath("$.editable").value(true));
        send(put("/api/schedules/{id}", id), admin, with(body("fixed by admin"), "version", 0))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.createdBy.loginIdentifier").value("alice"))
                .andExpect(jsonPath("$.updatedBy.loginIdentifier").value("admin"));
        send(delete("/api/schedules/{id}", id), admin, null).andExpect(status().isNoContent());
    }

    // --- Update ---

    @Test
    void updateUsesOptimisticLocking() throws Exception {
        long id = create(alice, body("v0"));

        send(put("/api/schedules/{id}", id), alice, with(body("v1"), "version", 0))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("v1"))
                .andExpect(jsonPath("$.version").value(1));
        // A stale form (still version 0) must not overwrite the newer change.
        send(put("/api/schedules/{id}", id), alice, with(body("stale"), "version", 0))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SCHEDULE_VERSION_CONFLICT"));
        send(put("/api/schedules/{id}", id), alice, body("no version"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/schedules/{id}", id).session(alice)).andExpect(jsonPath("$.title").value("v1"));
    }

    @Test
    void updateValidatesPeriod() throws Exception {
        long id = create(alice, body("t"));
        send(put("/api/schedules/{id}", id), alice,
                with(body("t", "2026-09-28T12:00:00", "2026-09-28T09:00:00"), "version", 0))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_SCHEDULE_PERIOD"));
    }

    @Test
    void usersFollowStatusTransitionsAndAdminMayForce() throws Exception {
        long id = create(alice, body("t"));

        send(put("/api/schedules/{id}", id), alice, with(with(body("t"), "status", "COMPLETED"), "version", 0))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_STATUS_TRANSITION"));
        send(put("/api/schedules/{id}", id), alice, with(with(body("t"), "status", "IN_PROGRESS"), "version", 0))
                .andExpect(status().isOk());
        send(put("/api/schedules/{id}", id), alice, with(with(body("t"), "status", "COMPLETED"), "version", 1))
                .andExpect(status().isOk());
        send(put("/api/schedules/{id}", id), alice, with(with(body("t"), "status", "PLANNED"), "version", 2))
                .andExpect(status().isBadRequest());
        send(put("/api/schedules/{id}", id), admin, with(with(body("t"), "status", "PLANNED"), "version", 2))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PLANNED"));
    }

    // --- Delete ---

    @Test
    void deleteIsLogical() throws Exception {
        long id = create(alice, body("to delete"));

        send(delete("/api/schedules/{id}", id), alice, null).andExpect(status().isNoContent());

        mockMvc.perform(get("/api/schedules/{id}", id).session(alice)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/schedules").session(alice)).andExpect(jsonPath("$.totalElements").value(0));
        send(delete("/api/schedules/{id}", id), alice, null).andExpect(status().isNotFound());
        Schedule row = scheduleRepository.findById(id).orElseThrow();
        assertThat(row.isDeleted()).isTrue();
    }

    // --- List / search ---

    @Test
    void listDefaultsToStartTimeDescendingWithPaging() throws Exception {
        create(alice, body("early", "2026-09-01T09:00:00", "2026-09-01T10:00:00"));
        create(alice, body("late", "2026-09-30T09:00:00", "2026-09-30T10:00:00"));
        create(alice, body("middle", "2026-09-15T09:00:00", "2026-09-15T10:00:00"));

        mockMvc.perform(get("/api/schedules?page=0&size=2").session(alice))
                .andExpect(jsonPath("$.content[*].title", contains("late", "middle")))
                .andExpect(jsonPath("$.content[0].description").doesNotExist())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(2))
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.totalPages").value(2));
        mockMvc.perform(get("/api/schedules?page=1&size=2").session(alice))
                .andExpect(jsonPath("$.content[*].title", contains("early")));
        mockMvc.perform(get("/api/schedules?sort=title,asc").session(alice))
                .andExpect(jsonPath("$.content[*].title", contains("early", "late", "middle")));
    }

    @Test
    void rejectsInvalidListParameters() throws Exception {
        mockMvc.perform(get("/api/schedules?size=101").session(alice)).andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/schedules?page=-1").session(alice)).andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/schedules?sort=deleted,asc").session(alice)).andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/schedules?sort=title,sideways").session(alice)).andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/schedules?status=DONE").session(alice)).andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/schedules?from=2026-10-01&to=2026-09-01").session(alice))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_SCHEDULE_PERIOD"));
    }

    @Test
    void searchCombinesFilters() throws Exception {
        create(alice, with(with(body("Project Meeting", "2026-09-10T10:00:00", "2026-09-10T11:00:00"), "assigneeId", bobId),
                "priority", "HIGH"));
        create(alice, with(body("project review", "2026-09-20T10:00:00", "2026-09-20T11:00:00"), "status", "IN_PROGRESS"));
        create(alice, body("100% done_", "2026-10-05T10:00:00", "2026-10-05T11:00:00"));
        create(bob, with(body("bob project", "2026-09-10T10:00:00", "2026-09-10T11:00:00"), "isPublic", true));

        mockMvc.perform(get("/api/schedules?keyword=PROJECT").session(alice))
                .andExpect(jsonPath("$.content[*].title", containsInAnyOrder("bob project", "Project Meeting", "project review")));
        mockMvc.perform(get("/api/schedules").param("keyword", "100%").session(alice))
                .andExpect(jsonPath("$.content[*].title", contains("100% done_")));
        mockMvc.perform(get("/api/schedules").param("keyword", "_").session(alice))
                .andExpect(jsonPath("$.content[*].title", contains("100% done_")));
        mockMvc.perform(get("/api/schedules?status=IN_PROGRESS").session(alice))
                .andExpect(jsonPath("$.content[*].title", contains("project review")));
        mockMvc.perform(get("/api/schedules?priority=HIGH").session(alice))
                .andExpect(jsonPath("$.content[*].title", contains("Project Meeting")));
        mockMvc.perform(get("/api/schedules?assigneeId=" + bobId).session(alice))
                .andExpect(jsonPath("$.content[*].title", contains("Project Meeting")));
        mockMvc.perform(get("/api/schedules?createdById=" + bobId).session(alice))
                .andExpect(jsonPath("$.content[*].title", contains("bob project")));
        mockMvc.perform(get("/api/schedules?keyword=project&createdById=" + aliceId + "&sort=title,asc").session(alice))
                .andExpect(jsonPath("$.content[*].title", contains("Project Meeting", "project review")));
    }

    @Test
    void periodSearchMatchesOverlappingSchedules() throws Exception {
        create(alice, body("long", "2026-08-25T09:00:00", "2026-09-05T18:00:00"));
        create(alice, body("inside", "2026-09-03T09:00:00", "2026-09-03T10:00:00"));
        create(alice, body("last day", "2026-09-07T23:00:00", "2026-09-07T23:30:00"));
        create(alice, body("after", "2026-09-08T00:00:00", "2026-09-08T01:00:00"));
        create(alice, body("before", "2026-08-01T09:00:00", "2026-08-31T23:59:00"));

        mockMvc.perform(get("/api/schedules?from=2026-09-01&to=2026-09-07&sort=title,asc").session(alice))
                .andExpect(jsonPath("$.content[*].title", contains("inside", "last day", "long")));
    }

    // --- Conflicts ---

    @Test
    void conflictsFindOverlapsOfTheSameAssignee() throws Exception {
        long existing = create(alice, with(body("busy", "2026-09-28T10:00:00", "2026-09-28T11:00:00"), "assigneeId", bobId));
        create(alice, with(with(body("cancelled", "2026-09-28T10:00:00", "2026-09-28T11:00:00"), "assigneeId", bobId),
                "status", "CANCELLED"));
        create(alice, with(body("other assignee", "2026-09-28T10:00:00", "2026-09-28T11:00:00"), "assigneeId", aliceId));

        String base = "/api/schedules/conflicts?assigneeId=" + bobId;
        mockMvc.perform(get(base + "&startAt=2026-09-28T10:30:00&endAt=2026-09-28T12:00:00").session(alice))
                .andExpect(jsonPath("$.conflict").value(true))
                .andExpect(jsonPath("$.items[*].title", contains("busy")))
                .andExpect(jsonPath("$.hiddenCount").value(0));
        // Touching boundaries do not overlap.
        mockMvc.perform(get(base + "&startAt=2026-09-28T11:00:00&endAt=2026-09-28T12:00:00").session(alice))
                .andExpect(jsonPath("$.conflict").value(false))
                .andExpect(jsonPath("$.items", hasSize(0)));
        // Editing the schedule itself is not a conflict.
        mockMvc.perform(get(base + "&startAt=2026-09-28T10:00:00&endAt=2026-09-28T11:00:00&excludeId=" + existing).session(alice))
                .andExpect(jsonPath("$.conflict").value(false));
        mockMvc.perform(get(base + "&startAt=2026-09-28T12:00:00&endAt=2026-09-28T10:00:00").session(alice))
                .andExpect(status().isBadRequest());
    }

    @Test
    void conflictsDoNotRevealTitlesOfInvisibleSchedules() throws Exception {
        // bob's private schedule, assigned to bob: alice cannot see it.
        create(bob, with(body("bob secret", "2026-09-28T10:00:00", "2026-09-28T11:00:00"), "assigneeId", bobId));

        mockMvc.perform(get("/api/schedules/conflicts?assigneeId=" + bobId
                        + "&startAt=2026-09-28T10:00:00&endAt=2026-09-28T11:00:00").session(alice))
                .andExpect(jsonPath("$.conflict").value(true))
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.hiddenCount").value(1));
    }

    // --- Calendar ---

    @Test
    void calendarReturnsVisibleSchedulesOverlappingTheRange() throws Exception {
        create(alice, body("spans into range", "2026-08-30T09:00:00", "2026-09-01T10:00:00"));
        create(alice, with(body("in range", "2026-09-15T09:00:00", "2026-09-15T10:00:00"), "assigneeId", bobId));
        create(alice, with(body("done", "2026-09-10T09:00:00", "2026-09-10T10:00:00"), "status", "COMPLETED"));
        create(alice, body("after range", "2026-10-01T00:00:00", "2026-10-01T01:00:00"));
        create(bob, body("bob private", "2026-09-15T09:00:00", "2026-09-15T10:00:00"));

        mockMvc.perform(get("/api/schedules/calendar?from=2026-09-01&to=2026-09-30").session(alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].title", contains("spans into range", "done", "in range")))
                .andExpect(jsonPath("$.truncated").value(false));
        mockMvc.perform(get("/api/schedules/calendar?from=2026-09-01&to=2026-09-30&status=COMPLETED").session(alice))
                .andExpect(jsonPath("$.items[*].title", contains("done")));
        mockMvc.perform(get("/api/schedules/calendar?from=2026-09-01&to=2026-09-30&assigneeId=" + bobId).session(alice))
                .andExpect(jsonPath("$.items[*].title", contains("in range")));
        // bob sees what is assigned to him and his own schedule, not alice's private ones.
        mockMvc.perform(get("/api/schedules/calendar?from=2026-09-01&to=2026-09-30").session(bob))
                .andExpect(jsonPath("$.items[*].title", containsInAnyOrder("in range", "bob private")));
        mockMvc.perform(get("/api/schedules/calendar?from=2026-09-01&to=2026-09-30").session(admin))
                .andExpect(jsonPath("$.items", hasSize(4)));
    }

    @Test
    void calendarLimitsTheRange() throws Exception {
        mockMvc.perform(get("/api/schedules/calendar?from=2026-09-01&to=2026-11-01").session(alice)).andExpect(status().isOk());
        mockMvc.perform(get("/api/schedules/calendar?from=2026-09-01&to=2026-11-02").session(alice))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_CALENDAR_RANGE"));
        mockMvc.perform(get("/api/schedules/calendar?from=2026-09-02&to=2026-09-01").session(alice))
                .andExpect(jsonPath("$.code").value("INVALID_CALENDAR_RANGE"));
        mockMvc.perform(get("/api/schedules/calendar?from=2026-09-01").session(alice)).andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/schedules/calendar?from=2026-09-01&to=2026-09-30")).andExpect(status().isUnauthorized());
    }
}
