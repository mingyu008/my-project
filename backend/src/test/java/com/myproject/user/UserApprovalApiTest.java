package com.myproject.user;

import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.domain.UserStatus;
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
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class UserApprovalApiTest {

    private static final String PASSWORD = "Correct-Horse-9!";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private User pending;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();
        userRepository.save(User.create("admin", passwordEncoder.encode(PASSWORD), Set.of(Role.USER, Role.ADMIN)));
        userRepository.save(User.create("alice", passwordEncoder.encode(PASSWORD), Set.of(Role.USER)));
        pending = userRepository.save(User.createPending("newbie", passwordEncoder.encode(PASSWORD), Set.of(Role.USER)));
    }

    @Test
    void adminSeesPendingSignups() throws Exception {
        mockMvc.perform(get("/api/users").session(login(mockMvc, "admin", PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.loginIdentifier == 'newbie')].status", hasItem("PENDING")));
    }

    @Test
    void approvedUserCanLogIn() throws Exception {
        MockHttpSession admin = login(mockMvc, "admin", PASSWORD);

        mockMvc.perform(withCsrf(mockMvc, post("/api/users/{id}/approve", pending.getId()), admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        login(mockMvc, "newbie", PASSWORD);
    }

    @Test
    void rejectedSignupIsRemoved() throws Exception {
        MockHttpSession admin = login(mockMvc, "admin", PASSWORD);

        mockMvc.perform(withCsrf(mockMvc, post("/api/users/{id}/reject", pending.getId()), admin))
                .andExpect(status().isNoContent());

        assertThat(userRepository.existsByLoginIdentifier("newbie")).isFalse();
    }

    @Test
    void onlyPendingUsersCanBeApprovedOrRejected() throws Exception {
        MockHttpSession admin = login(mockMvc, "admin", PASSWORD);
        long activeId = userRepository.findByLoginIdentifier("alice").orElseThrow().getId();

        mockMvc.perform(withCsrf(mockMvc, post("/api/users/{id}/approve", activeId), admin))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("USER_NOT_PENDING"));
        mockMvc.perform(withCsrf(mockMvc, post("/api/users/{id}/reject", activeId), admin))
                .andExpect(status().isConflict());
        assertThat(userRepository.existsByLoginIdentifier("alice")).isTrue();

        mockMvc.perform(withCsrf(mockMvc, post("/api/users/{id}/approve", 999_999), admin))
                .andExpect(status().isNotFound());
    }

    @Test
    void nonAdminCannotApprove() throws Exception {
        MockHttpSession alice = login(mockMvc, "alice", PASSWORD);

        mockMvc.perform(withCsrf(mockMvc, post("/api/users/{id}/approve", pending.getId()), alice))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        assertThat(userRepository.findById(pending.getId()).orElseThrow().getStatus()).isEqualTo(UserStatus.PENDING);
    }

    @Test
    void approvalRequiresCsrfToken() throws Exception {
        MockHttpSession admin = login(mockMvc, "admin", PASSWORD);

        mockMvc.perform(post("/api/users/{id}/approve", pending.getId()).session(admin))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
        assertThat(userRepository.findById(pending.getId()).orElseThrow().getStatus()).isEqualTo(UserStatus.PENDING);
    }
}
