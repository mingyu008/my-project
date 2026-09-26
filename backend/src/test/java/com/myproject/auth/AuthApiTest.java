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
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
class AuthApiTest {

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
        User inactive = User.create("bob", passwordEncoder.encode(PASSWORD), Set.of(Role.USER));
        inactive.deactivate();
        userRepository.save(inactive);
    }

    private String fetchCsrfToken(MockHttpSession session) throws Exception {
        String body = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.token");
    }

    private ResultActions login(MockHttpSession session, String csrfToken, String username, String password)
            throws Exception {
        var request = post("/api/auth/login")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"%s\",\"password\":\"%s\"}".formatted(username, password));
        if (csrfToken != null) {
            request.header(CSRF_HEADER, csrfToken);
        }
        return mockMvc.perform(request);
    }

    // --- CSRF endpoint ---

    @Test
    void csrfEndpointReturnsHeaderNameAndToken() throws Exception {
        MockHttpSession session = new MockHttpSession();

        mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.headerName").value(CSRF_HEADER))
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(header().string("Cache-Control", containsString("no-store")));
    }

    // --- Login ---

    @Test
    void loginSucceedsWithValidCsrfToken() throws Exception {
        MockHttpSession session = new MockHttpSession();
        String csrfToken = fetchCsrfToken(session);

        login(session, csrfToken, "alice", PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.loginIdentifier").value("alice"))
                .andExpect(jsonPath("$.roles[0]").value("USER"))
                .andExpect(content().string(not(containsString("password"))))
                .andExpect(content().string(not(containsString(PASSWORD))))
                .andExpect(content().string(not(containsString("argon2"))));

        assertThat(session.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY))
                .isNotNull();
    }

    @Test
    void loginChangesSessionId() throws Exception {
        MockHttpSession session = new MockHttpSession();
        String csrfToken = fetchCsrfToken(session);
        String sessionIdBeforeLogin = session.getId();

        login(session, csrfToken, "alice", PASSWORD).andExpect(status().isOk());

        assertThat(session.getId()).isNotEqualTo(sessionIdBeforeLogin);
    }

    @Test
    void loginWithoutCsrfTokenIsRejected() throws Exception {
        login(new MockHttpSession(), null, "alice", PASSWORD)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
    }

    @Test
    void loginWithInvalidCsrfTokenIsRejected() throws Exception {
        MockHttpSession session = new MockHttpSession();
        fetchCsrfToken(session);

        login(session, "not-a-valid-token", "alice", PASSWORD)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
    }

    @Test
    void csrfTokenFromAnotherSessionIsRejected() throws Exception {
        String otherSessionToken = fetchCsrfToken(new MockHttpSession());
        MockHttpSession session = new MockHttpSession();
        fetchCsrfToken(session);

        login(session, otherSessionToken, "alice", PASSWORD)
                .andExpect(status().isForbidden());
    }

    @Test
    void csrfTokenIsRotatedOnLogin() throws Exception {
        MockHttpSession session = new MockHttpSession();
        String tokenBeforeLogin = fetchCsrfToken(session);
        login(session, tokenBeforeLogin, "alice", PASSWORD).andExpect(status().isOk());

        login(session, tokenBeforeLogin, "alice", PASSWORD)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));

        String tokenAfterLogin = fetchCsrfToken(session);
        login(session, tokenAfterLogin, "alice", PASSWORD).andExpect(status().isOk());
    }

    @Test
    void authenticationFailuresAreIndistinguishable() throws Exception {
        String wrongPassword = failedLoginBody("alice", "wrong-password");
        String unknownUser = failedLoginBody("nobody", PASSWORD);
        String inactiveUser = failedLoginBody("bob", PASSWORD);
        String blankPassword = failedLoginBody("alice", "");

        assertThat(wrongPassword)
                .isEqualTo(unknownUser)
                .isEqualTo(inactiveUser)
                .isEqualTo(blankPassword)
                .isEqualTo("{\"code\":\"AUTHENTICATION_FAILED\",\"message\":\"Invalid login identifier or password\"}");
    }

    private String failedLoginBody(String username, String password) throws Exception {
        MockHttpSession session = new MockHttpSession();
        String csrfToken = fetchCsrfToken(session);
        String body = login(session, csrfToken, username, password)
                .andExpect(status().isUnauthorized())
                .andReturn().getResponse().getContentAsString();
        assertThat(session.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY)).isNull();
        return body;
    }

    @Test
    void malformedLoginBodyIsBadRequestAndNotLogged(CapturedOutput output) throws Exception {
        MockHttpSession session = new MockHttpSession();
        String csrfToken = fetchCsrfToken(session);

        mockMvc.perform(post("/api/auth/login")
                        .session(session)
                        .header(CSRF_HEADER, csrfToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"alice\",\"password\":UnquotedSecret123}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"))
                .andExpect(content().string(not(containsString("UnquotedSecret123"))));

        assertThat(output.getAll()).doesNotContain("UnquotedSecret123");
    }

    @Test
    void passwordIsNotLogged(CapturedOutput output) throws Exception {
        MockHttpSession session = new MockHttpSession();
        login(session, fetchCsrfToken(session), "alice", PASSWORD).andExpect(status().isOk());
        MockHttpSession failed = new MockHttpSession();
        login(failed, fetchCsrfToken(failed), "alice", "Wrong-Password-For-Log").andExpect(status().isUnauthorized());

        assertThat(output.getAll())
                .contains("Authentication succeeded", "Authentication failed")
                .doesNotContain(PASSWORD, "Wrong-Password-For-Log", "$argon2id$");
    }

    // --- Current user ---

    @Test
    void meReturnsCurrentUserAfterLogin() throws Exception {
        MockHttpSession session = new MockHttpSession();
        login(session, fetchCsrfToken(session), "alice", PASSWORD).andExpect(status().isOk());

        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.loginIdentifier").value("alice"))
                .andExpect(jsonPath("$.roles[0]").value("USER"))
                .andExpect(content().string(not(containsString("password"))));
    }

    @Test
    void meWithoutSessionReturns401() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    // --- Protected API ---

    @Test
    void unauthenticatedRequestToProtectedApiReturns401Json() throws Exception {
        mockMvc.perform(get("/api/anything"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }
}
