package com.myproject.auth;

import com.jayway.jsonpath.JsonPath;
import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Own context (small limits) and a fresh limiter per test.
 */
@SpringBootTest(properties = {
        "app.login-rate-limit.max-failures-per-identifier=3",
        "app.login-rate-limit.max-failures-per-client=8"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@ExtendWith(OutputCaptureExtension.class)
class LoginRateLimitApiTest {

    private static final String PASSWORD = "Correct-Horse-9!";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();
        userRepository.save(User.create("alice", passwordEncoder.encode(PASSWORD), Set.of(Role.USER)));
        userRepository.save(User.create("carol", passwordEncoder.encode(PASSWORD), Set.of(Role.USER)));
    }

    private ResultActions login(String username, String password) throws Exception {
        MockHttpSession session = new MockHttpSession();
        String csrf = mockMvc.perform(get("/api/auth/csrf").session(session)).andReturn().getResponse().getContentAsString();
        return mockMvc.perform(post("/api/auth/login")
                .session(session)
                .header("X-XSRF-TOKEN", JsonPath.<String>read(csrf, "$.token"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"%s\",\"password\":\"%s\"}".formatted(username, password)));
    }

    @Test
    void blocksIdentifierAfterRepeatedFailuresEvenWithCorrectPassword(CapturedOutput output) throws Exception {
        for (int i = 0; i < 3; i++) {
            login("alice", "wrong-" + i).andExpect(status().isUnauthorized());
        }

        login("ALICE", PASSWORD)
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.code").value("TOO_MANY_ATTEMPTS"));

        // Other accounts are unaffected (client limit not reached).
        login("carol", PASSWORD).andExpect(status().isOk());
        assertThat(output.getAll()).contains("Login blocked by rate limit").doesNotContain("wrong-0");
    }

    @Test
    void unknownIdentifierIsBlockedTheSameWay() throws Exception {
        for (int i = 0; i < 3; i++) {
            login("nobody", "wrong").andExpect(status().isUnauthorized());
        }

        login("nobody", "wrong")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("TOO_MANY_ATTEMPTS"));
    }

    @Test
    void successfulLoginResetsIdentifierCounter() throws Exception {
        login("alice", "wrong").andExpect(status().isUnauthorized());
        login("alice", "wrong").andExpect(status().isUnauthorized());
        login("alice", PASSWORD).andExpect(status().isOk());
        login("alice", "wrong").andExpect(status().isUnauthorized());
        login("alice", "wrong").andExpect(status().isUnauthorized());

        login("alice", PASSWORD).andExpect(status().isOk());
    }

    @Test
    void blocksClientSprayingManyIdentifiers() throws Exception {
        for (int i = 0; i < 8; i++) {
            login("spray-" + i, "wrong").andExpect(status().isUnauthorized());
        }

        login("carol", PASSWORD).andExpect(status().isTooManyRequests());
    }
}
