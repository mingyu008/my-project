package com.myproject.user;

import com.myproject.user.domain.User;
import com.myproject.user.domain.UserStatus;
import com.myproject.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static com.myproject.support.MockMvcSessions.CSRF_HEADER;
import static com.myproject.support.MockMvcSessions.csrfToken;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Own context with a high signup limit (limiting itself is covered by SignupRateLimitTest).
 */
@SpringBootTest(properties = "app.signup-rate-limit.max-attempts-per-client=1000")
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
class SignupApiTest {

    private static final String PASSWORD = "Long-Enough-Pass-1";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();
    }

    private ResultActions signup(String username, String password) throws Exception {
        MockHttpSession session = new MockHttpSession();
        return mockMvc.perform(post("/api/auth/signup")
                .session(session)
                .header(CSRF_HEADER, csrfToken(mockMvc, session))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"%s\",\"password\":\"%s\"}".formatted(username, password)));
    }

    private ResultActions login(String username, String password) throws Exception {
        MockHttpSession session = new MockHttpSession();
        return mockMvc.perform(post("/api/auth/login")
                .session(session)
                .header(CSRF_HEADER, csrfToken(mockMvc, session))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"%s\",\"password\":\"%s\"}".formatted(username, password)));
    }

    @Test
    void createsPendingUserWithHashedPassword() throws Exception {
        signup("  New.User ", PASSWORD)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.loginIdentifier").value("new.user"))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(content().string(not(containsString("password"))));

        User user = userRepository.findByLoginIdentifier("new.user").orElseThrow();
        assertThat(user.getStatus()).isEqualTo(UserStatus.PENDING);
        assertThat(user.getPasswordHash()).startsWith("{argon2}").doesNotContain(PASSWORD);
    }

    @Test
    void pendingUserCannotLoginAndGetsTheGenericMessage() throws Exception {
        signup("pending-user", PASSWORD).andExpect(status().isCreated());

        login("pending-user", PASSWORD)
                .andExpect(status().isUnauthorized())
                .andExpect(content().json("{\"code\":\"AUTHENTICATION_FAILED\",\"message\":\"Invalid login identifier or password\"}", true));
    }

    @Test
    void signupRequiresCsrfToken() throws Exception {
        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"no-csrf\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
        assertThat(userRepository.existsByLoginIdentifier("no-csrf")).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"abc", "has space", "bad/slash", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "", "한글아이디"})
    void rejectsInvalidLoginIdentifier(String username) throws Exception {
        signup(username, PASSWORD)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_LOGIN_IDENTIFIER"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"short-1", "weak-user-12345", "zzzzzzzzzzzzzzzz"})
    void rejectsWeakPasswordWithoutEchoingIt(String password) throws Exception {
        signup("weak-user", password)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PASSWORD"))
                .andExpect(content().string(not(containsString(password))));
        assertThat(userRepository.existsByLoginIdentifier("weak-user")).isFalse();
    }

    @Test
    void rejectsTakenIdentifierCaseInsensitively() throws Exception {
        signup("taken-name", PASSWORD).andExpect(status().isCreated());

        signup("TAKEN-Name", PASSWORD)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("LOGIN_IDENTIFIER_TAKEN"));
    }

    @Test
    void doesNotLogPasswordOrIdentifier(CapturedOutput output) throws Exception {
        signup("log-check-signup", "Unrelated-Secret-Words-7").andExpect(status().isCreated());
        signup("log-check-weak", "short").andExpect(status().isBadRequest());

        assertThat(output.getAll())
                .contains("Signup: userId=")
                .doesNotContain("Unrelated-Secret-Words-7", "log-check-signup", "log-check-weak");
    }
}
