package com.myproject.user;

import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Set;

import static com.myproject.support.MockMvcSessions.login;
import static com.myproject.support.MockMvcSessions.withCsrf;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ConfirmerRoleApiTest {

    private static final String PASSWORD = "Correct-Horse-9!";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private MockHttpSession admin;
    private MockHttpSession carol;
    private long carolId;

    @BeforeEach
    void setUp() throws Exception {
        userRepository.deleteAll();
        userRepository.save(User.create("admin", passwordEncoder.encode(PASSWORD), Set.of(Role.USER, Role.ADMIN)));
        carolId = userRepository.save(User.create("carol", passwordEncoder.encode(PASSWORD), Set.of(Role.USER))).getId();
        admin = login(mockMvc, "admin", PASSWORD);
        carol = login(mockMvc, "carol", PASSWORD);
    }

    @Test
    void adminGrantsAndRevokesConfirmerAndExistingSessionsFollow() throws Exception {
        mockMvc.perform(withCsrf(mockMvc, put("/api/users/{id}/roles/confirmer", carolId), admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roles", containsInAnyOrder("USER", "CONFIRMER")));
        // Idempotent.
        mockMvc.perform(withCsrf(mockMvc, put("/api/users/{id}/roles/confirmer", carolId), admin)).andExpect(status().isOk());
        // carol's session, created before the grant, sees the new role on its next request.
        mockMvc.perform(get("/api/auth/me").session(carol))
                .andExpect(jsonPath("$.roles", containsInAnyOrder("USER", "CONFIRMER")));

        mockMvc.perform(withCsrf(mockMvc, delete("/api/users/{id}/roles/confirmer", carolId), admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roles", containsInAnyOrder("USER")));
        mockMvc.perform(get("/api/auth/me").session(carol)).andExpect(jsonPath("$.roles", containsInAnyOrder("USER")));
    }

    @Test
    void onlyAdminsManageRolesAndOnlyForActiveUsers() throws Exception {
        mockMvc.perform(withCsrf(mockMvc, put("/api/users/{id}/roles/confirmer", carolId), carol))
                .andExpect(status().isForbidden());
        assertThat(userRepository.findById(carolId).orElseThrow().getRoles()).containsExactly(Role.USER);

        long pendingId = userRepository.save(User.createPending("newbie", passwordEncoder.encode(PASSWORD), Set.of(Role.USER))).getId();
        mockMvc.perform(withCsrf(mockMvc, put("/api/users/{id}/roles/confirmer", pendingId), admin))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("USER_NOT_ACTIVE"));
        mockMvc.perform(withCsrf(mockMvc, put("/api/users/{id}/roles/confirmer", 999_999), admin))
                .andExpect(status().isNotFound());
    }
}
