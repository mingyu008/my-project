package com.myproject.security;

import com.jayway.jsonpath.JsonPath;
import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Changes to a user apply to sessions that already exist.
 */
@SpringBootTest
@AutoConfigureMockMvc
class SessionRevalidationTest {

    private static final String PASSWORD = "Correct-Horse-9!";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private User alice;
    private User admin;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();
        alice = userRepository.save(User.create("alice", passwordEncoder.encode(PASSWORD), Set.of(Role.USER)));
        admin = userRepository.save(User.create("admin", passwordEncoder.encode(PASSWORD), Set.of(Role.USER, Role.ADMIN)));
    }

    private MockHttpSession loginAs(String username) throws Exception {
        MockHttpSession session = new MockHttpSession();
        String csrf = mockMvc.perform(get("/api/auth/csrf").session(session)).andReturn().getResponse().getContentAsString();
        mockMvc.perform(post("/api/auth/login")
                        .session(session)
                        .header("X-XSRF-TOKEN", JsonPath.<String>read(csrf, "$.token"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"%s\",\"password\":\"%s\"}".formatted(username, PASSWORD)))
                .andExpect(status().isOk());
        return session;
    }

    @Test
    void deactivatingUserEndsExistingSession() throws Exception {
        MockHttpSession session = loginAs("alice");
        mockMvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk());

        alice.deactivate();
        userRepository.save(alice);

        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
        assertThat(session.isInvalid()).isTrue();
    }

    @Test
    void deletingUserEndsExistingSession() throws Exception {
        MockHttpSession session = loginAs("alice");

        userRepository.delete(alice);

        mockMvc.perform(get("/api/grid/data").session(session)).andExpect(status().isUnauthorized());
        assertThat(session.isInvalid()).isTrue();
    }

    @Test
    void revokedAdminRoleIsEnforcedImmediately() throws Exception {
        MockHttpSession session = loginAs("admin");
        mockMvc.perform(get("/api/users").session(session)).andExpect(status().isOk());

        admin.changeRoles(Set.of(Role.USER));
        userRepository.save(admin);

        mockMvc.perform(get("/api/users").session(session))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roles", contains("USER")));
    }

    @Test
    void grantedRoleIsAppliedWithoutRelogin() throws Exception {
        MockHttpSession session = loginAs("alice");
        mockMvc.perform(get("/api/users").session(session)).andExpect(status().isForbidden());

        alice.changeRoles(Set.of(Role.USER, Role.ADMIN));
        userRepository.save(alice);

        mockMvc.perform(get("/api/users").session(session)).andExpect(status().isOk());
        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(jsonPath("$.roles", containsInAnyOrder("USER", "ADMIN")));
    }
}
