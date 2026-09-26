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

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Unauthenticated -> 401, authenticated but not permitted -> 403, using real login sessions.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AuthorizationTest {

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
        userRepository.save(User.create("admin", passwordEncoder.encode(PASSWORD), Set.of(Role.USER, Role.ADMIN)));
    }

    private MockHttpSession loginAs(String username) throws Exception {
        MockHttpSession session = new MockHttpSession();
        String csrf = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andReturn().getResponse().getContentAsString();
        mockMvc.perform(post("/api/auth/login")
                        .session(session)
                        .header("X-XSRF-TOKEN", JsonPath.<String>read(csrf, "$.token"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"%s\",\"password\":\"%s\"}".formatted(username, PASSWORD)))
                .andExpect(status().isOk());
        return session;
    }

    // --- 401 ---

    @Test
    void anonymousGets401OnProtectedApis() throws Exception {
        for (String path : new String[]{"/api/auth/me", "/api/grid/data", "/api/users"}) {
            mockMvc.perform(get(path))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
        }
    }

    // --- /api/grid/data: any authenticated user ---

    @Test
    void userCanReadGridData() throws Exception {
        mockMvc.perform(get("/api/grid/data").param("startRow", "0").param("endRow", "50").session(loginAs("alice")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows", hasSize(50)))
                .andExpect(jsonPath("$.lastRow").value(250))
                .andExpect(jsonPath("$.rows[0].id").value(1));
    }

    @Test
    void gridDataSupportsSorting() throws Exception {
        mockMvc.perform(get("/api/grid/data")
                        .param("startRow", "0").param("endRow", "1")
                        .param("sortField", "id").param("sortDirection", "desc")
                        .session(loginAs("alice")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].id").value(250));
    }

    @Test
    void invalidGridParametersReturn400() throws Exception {
        MockHttpSession session = loginAs("alice");

        mockMvc.perform(get("/api/grid/data").param("startRow", "10").param("endRow", "5").session(session))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mockMvc.perform(get("/api/grid/data").param("startRow", "0").param("endRow", "10000").session(session))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/grid/data").param("sortField", "passwordHash").session(session))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/grid/data").param("startRow", "abc").session(session))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    // --- /api/users: ADMIN only ---

    @Test
    void userWithoutAdminRoleGets403OnUsers() throws Exception {
        mockMvc.perform(get("/api/users").session(loginAs("alice")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void adminCanListUsersWithoutPasswordHash() throws Exception {
        mockMvc.perform(get("/api/users").session(loginAs("admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].loginIdentifier").value("alice"))
                .andExpect(content().string(not(containsString("password"))))
                .andExpect(content().string(not(containsString("argon2"))));
    }
}
