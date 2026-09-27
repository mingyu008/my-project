package com.myproject.notification;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jayway.jsonpath.JsonPath;
import com.myproject.schedule.ScheduleRepository;
import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.repository.UserRepository;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static com.myproject.support.MockMvcSessions.login;
import static com.myproject.support.MockMvcSessions.withCsrf;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Schedule changes reach a (local, fake) Slack Incoming Webhook after commit, never for failed saves,
 * and a failing Slack never affects the API.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ScheduleSlackNotificationTest {

    private static final String PASSWORD = "Correct-Horse-9!";
    private static final BlockingQueue<String> RECEIVED = new LinkedBlockingQueue<>();
    private static final AtomicInteger RESPONSE_STATUS = new AtomicInteger(200);
    private static final HttpServer SLACK = startFakeSlack();

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

    private static HttpServer startFakeSlack() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/services/T000/B000/secret", exchange -> {
                RECEIVED.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                exchange.sendResponseHeaders(RESPONSE_STATUS.get(), -1);
                exchange.close();
            });
            server.start();
            return server;
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    @DynamicPropertySource
    static void slack(DynamicPropertyRegistry registry) {
        registry.add("app.notify.slack.webhook-url",
                () -> "http://127.0.0.1:" + SLACK.getAddress().getPort() + "/services/T000/B000/secret");
        registry.add("app.notify.slack.public-url", () -> "https://app.example.com");
    }

    @AfterAll
    static void stopFakeSlack() {
        SLACK.stop(0);
    }

    @BeforeEach
    void setUp() throws Exception {
        scheduleRepository.deleteAllInBatch();
        userRepository.deleteAll();
        userRepository.save(User.create("alice", passwordEncoder.encode(PASSWORD), Set.of(Role.USER)));
        alice = login(mockMvc, "alice", PASSWORD);
        RECEIVED.clear();
        RESPONSE_STATUS.set(200);
    }

    @AfterEach
    void tearDown() {
        scheduleRepository.deleteAllInBatch();
    }

    private Map<String, Object> body(String title, String status) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", title);
        body.put("startAt", "2026-09-28T10:00:00");
        body.put("endAt", "2026-09-28T11:00:00");
        body.put("status", status);
        body.put("priority", "NORMAL");
        body.put("isPublic", false);
        return body;
    }

    private String nextMessage() throws Exception {
        String json = RECEIVED.poll(5, TimeUnit.SECONDS);
        assertThat(json).as("Slack message").isNotNull();
        return JsonPath.read(json, "$.text");
    }

    @Test
    void createAndUpdateAreSentAfterCommit() throws Exception {
        String response = mockMvc.perform(withCsrf(mockMvc, post("/api/schedules"), alice)
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body("Kickoff", "PLANNED"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long id = ((Number) JsonPath.read(response, "$.id")).longValue();

        assertThat(nextMessage())
                .startsWith(":new: *새 일정 등록* · alice")
                .contains("<https://app.example.com/schedule/" + id + "|Kickoff>");

        Map<String, Object> update = body("Kickoff", "IN_PROGRESS");
        update.put("version", 0);
        mockMvc.perform(withCsrf(mockMvc, put("/api/schedules/{id}", id), alice)
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(update)))
                .andExpect(status().isOk());

        assertThat(nextMessage()).startsWith(":pencil2: *일정 수정*").contains("• 변경: 상태 예정 → 진행중");

        // Saving without changes sends nothing.
        update.put("version", 1);
        mockMvc.perform(withCsrf(mockMvc, put("/api/schedules/{id}", id), alice)
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(update)))
                .andExpect(status().isOk());
        assertThat(RECEIVED.poll(1, TimeUnit.SECONDS)).isNull();
    }

    @Test
    void failedSavesSendNothing() throws Exception {
        Map<String, Object> invalid = body("Bad period", "PLANNED");
        invalid.put("endAt", "2026-09-28T09:00:00");
        mockMvc.perform(withCsrf(mockMvc, post("/api/schedules"), alice)
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(invalid)))
                .andExpect(status().isBadRequest());

        assertThat(RECEIVED.poll(1, TimeUnit.SECONDS)).isNull();
    }

    @Test
    void slackErrorsDoNotAffectSaving() throws Exception {
        RESPONSE_STATUS.set(500);

        mockMvc.perform(withCsrf(mockMvc, post("/api/schedules"), alice)
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body("Still saved", "PLANNED"))))
                .andExpect(status().isCreated());

        assertThat(nextMessage()).contains("Still saved");
        assertThat(scheduleRepository.count()).isEqualTo(1);
    }
}
