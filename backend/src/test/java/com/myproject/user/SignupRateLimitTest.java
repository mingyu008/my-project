package com.myproject.user;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static com.myproject.support.MockMvcSessions.CSRF_HEADER;
import static com.myproject.support.MockMvcSessions.csrfToken;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "app.signup-rate-limit.max-attempts-per-client=3")
@AutoConfigureMockMvc
class SignupRateLimitTest {

    @Autowired
    private MockMvc mockMvc;

    private ResultActions signup(String username) throws Exception {
        MockHttpSession session = new MockHttpSession();
        return mockMvc.perform(post("/api/auth/signup")
                .session(session)
                .header(CSRF_HEADER, csrfToken(mockMvc, session))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"%s\",\"password\":\"Long-Enough-Pass-1\"}".formatted(username)));
    }

    @Test
    void limitsAttemptsPerClientIncludingFailures() throws Exception {
        signup("limit-user-1").andExpect(status().isCreated());
        signup("x").andExpect(status().isBadRequest());
        signup("limit-user-1").andExpect(status().isConflict());

        signup("limit-user-2")
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.code").value("TOO_MANY_SIGNUPS"));
    }
}
