package com.myproject;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.LinkedHashMap;
import java.util.Map;

import static com.myproject.support.MockMvcSessions.login;
import static com.myproject.support.MockMvcSessions.withCsrf;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The production database path on a real PostgreSQL (same major version as Neon's default):
 * Flyway migrations + Hibernate validate + the queries that differ most between databases.
 * Skipped when Docker is not available.
 */
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(properties = {
        "spring.flyway.enabled=true",
        "spring.jpa.hibernate.ddl-auto=validate",
        "app.bootstrap-admin.login-identifier=boss",
        "app.bootstrap-admin.password=Bootstrap-Admin-Pass-9"
})
@AutoConfigureMockMvc
class PostgresMigrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void migratesValidatesAndRunsTheMainQueries() throws Exception {
        assertThat(jdbc.queryForObject("select version from flyway_schema_history where success order by installed_rank desc limit 1",
                String.class)).isEqualTo("5");

        // The bootstrap admin can log in (Argon2 hash stored in PostgreSQL).
        MockHttpSession admin = login(mockMvc, "boss", "Bootstrap-Admin-Pass-9");
        mockMvc.perform(get("/api/auth/me").session(admin)).andExpect(jsonPath("$.roles", org.hamcrest.Matchers.hasItem("ADMIN")));

        long bossId = ((Number) JsonPath.read(mockMvc.perform(get("/api/schedules/assignees").session(admin))
                .andReturn().getResponse().getContentAsString(), "$[0].id")).longValue();

        long done = createSchedule(admin, "100% Done_Report", "2026-09-10T09:00:00", "2026-09-10T10:00:00", "COMPLETED", bossId);
        createSchedule(admin, "weekly meeting", "2026-09-10T09:30:00", "2026-09-10T11:00:00", "PLANNED", bossId);

        // LIKE with escaped wildcards, case-insensitive.
        mockMvc.perform(get("/api/schedules").param("keyword", "100% done_").session(admin))
                .andExpect(jsonPath("$.content[*].title", contains("100% Done_Report")));
        // Period overlap + ordering on timestamp columns.
        mockMvc.perform(get("/api/schedules/calendar?from=2026-09-10&to=2026-09-10").session(admin))
                .andExpect(jsonPath("$.items[*].title", contains("100% Done_Report", "weekly meeting")));
        // Overlap check.
        mockMvc.perform(get("/api/schedules/conflicts?assigneeId=" + bossId + "&startAt=2026-09-10T09:45:00&endAt=2026-09-10T09:50:00")
                        .session(admin))
                .andExpect(jsonPath("$.conflict").value(true));

        // Rewards: an admin may not reward themselves, so reward a second user; the summary uses CASE + SUM.
        jdbc.update("insert into users (login_identifier, password_hash, status, created_at, updated_at) "
                + "values ('member', '{noop}x', 'ACTIVE', now(), now())");
        long memberId = jdbc.queryForObject("select id from users where login_identifier = 'member'", Long.class);
        jdbc.update("insert into user_roles (user_id, role) values (?, 'USER')", memberId);
        mockMvc.perform(withCsrf(mockMvc, post("/api/schedules/{id}/rewards", done), admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"recipientId\":" + memberId + ",\"points\":120,\"reason\":\"on time\"}"))
                .andExpect(status().isCreated());
        mockMvc.perform(get("/api/rewards/summary").session(admin))
                .andExpect(jsonPath("$[0].recipient.loginIdentifier").value("member"))
                .andExpect(jsonPath("$[0].pendingPoints").value(120))
                .andExpect(jsonPath("$[0].paidPoints").value(0));

        // Enum CHECK constraints are in place.
        assertThat(jdbc.queryForObject("select count(*) from information_schema.check_constraints", Integer.class))
                .isGreaterThanOrEqualTo(6);
    }

    /**
     * Supabase's Data API reaches tables as the anon/authenticated roles, which get table grants by default.
     * With RLS and no policies they must see and change nothing, while the app (table owner) is unaffected.
     */
    @Test
    void rowLevelSecurityShutsOutNonOwnerRoles() {
        assertThat(jdbc.queryForList(
                "select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity",
                String.class)).isEmpty();

        jdbc.update("insert into users (login_identifier, password_hash, status, created_at, updated_at) "
                + "values ('rls-probe', '{noop}secret-hash', 'ACTIVE', now(), now())");
        assertThat(jdbc.queryForObject("select count(*) from users where login_identifier = 'rls-probe'", Integer.class)).isEqualTo(1);

        jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Void>) connection -> {
            try (var statement = connection.createStatement()) {
                statement.execute("do $$ begin if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if; end $$");
                statement.execute("grant usage on schema public to anon");
                statement.execute("grant select, insert, update, delete on all tables in schema public to anon");
                statement.execute("set role anon");
                try {
                    try (var rows = statement.executeQuery("select count(*) from users")) {
                        rows.next();
                        assertThat(rows.getInt(1)).isZero();
                    }
                    assertThat(statement.executeUpdate("update users set status = 'INACTIVE'")).isZero();
                    org.assertj.core.api.Assertions.assertThatThrownBy(() -> statement.execute(
                                    "insert into users (login_identifier, password_hash, status, created_at, updated_at) "
                                            + "values ('intruder', 'x', 'ACTIVE', now(), now())"))
                            .hasMessageContaining("row-level security");
                } finally {
                    statement.execute("reset role");
                }
            }
            return null;
        });
    }

    private long createSchedule(MockHttpSession session, String title, String startAt, String endAt, String status, long assigneeId)
            throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", title);
        body.put("startAt", startAt);
        body.put("endAt", endAt);
        body.put("status", status);
        body.put("priority", "NORMAL");
        body.put("assigneeId", assigneeId);
        body.put("isPublic", false);
        String response = mockMvc.perform(withCsrf(mockMvc, post("/api/schedules"), session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(response, "$.id")).longValue();
    }
}
