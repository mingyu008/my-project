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
import org.springframework.test.web.servlet.MockMvc;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
class LogoutApiTest {

    private static final String CSRF_HEADER = "X-XSRF-TOKEN";
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
    }

    private String csrfToken(MockHttpSession session) throws Exception {
        return JsonPath.read(mockMvc.perform(get("/api/auth/csrf").session(session))
                .andReturn().getResponse().getContentAsString(), "$.token");
    }

    private MockHttpSession loggedInSession() throws Exception {
        MockHttpSession session = new MockHttpSession();
        mockMvc.perform(post("/api/auth/login")
                        .session(session)
                        .header(CSRF_HEADER, csrfToken(session))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"alice\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk());
        return session;
    }

    @Test
    void logoutInvalidatesSessionAndClearsCookie(CapturedOutput output) throws Exception {
        MockHttpSession session = loggedInSession();

        mockMvc.perform(post("/api/auth/logout").session(session).header(CSRF_HEADER, csrfToken(session)))
                .andExpect(status().isNoContent())
                .andExpect(header().string("Set-Cookie", allOf(containsString("JSESSIONID="), containsString("Max-Age=0"))))
                .andExpect(content().string(""));

        assertThat(session.isInvalid()).isTrue();
        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isUnauthorized());
        assertThat(output.getAll()).containsPattern("Logout: userId=\\d+");
    }

    @Test
    void logoutWithoutCsrfTokenIsRejectedAndKeepsSession() throws Exception {
        MockHttpSession session = loggedInSession();

        mockMvc.perform(post("/api/auth/logout").session(session))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));

        assertThat(session.isInvalid()).isFalse();
        mockMvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk());
    }

    @Test
    void logoutWithInvalidCsrfTokenIsRejected() throws Exception {
        MockHttpSession session = loggedInSession();

        mockMvc.perform(post("/api/auth/logout").session(session).header(CSRF_HEADER, "forged"))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk());
    }

    @Test
    void getLogoutDoesNotLogOut() throws Exception {
        MockHttpSession session = loggedInSession();

        mockMvc.perform(get("/api/auth/logout").session(session));

        assertThat(session.isInvalid()).isFalse();
        mockMvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk());
    }

    @Test
    void logoutIsIdempotentWithoutAuthentication() throws Exception {
        MockHttpSession session = new MockHttpSession();

        mockMvc.perform(post("/api/auth/logout").session(session).header(CSRF_HEADER, csrfToken(session)))
                .andExpect(status().isNoContent());
    }

    @Test
    void csrfTokenOfLoggedOutSessionCannotBeReused() throws Exception {
        MockHttpSession session = loggedInSession();
        String token = csrfToken(session);
        mockMvc.perform(post("/api/auth/logout").session(session).header(CSRF_HEADER, token))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/auth/logout").session(session).header(CSRF_HEADER, token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
    }
}
