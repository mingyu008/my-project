package com.myproject.auth;

import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.domain.UserStatus;
import com.myproject.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.Set;

import static com.myproject.support.MockMvcSessions.CSRF_HEADER;
import static com.myproject.support.MockMvcSessions.csrfToken;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * app.auth.test-mode: signup with ID + nickname, login with nickname only, duplicate checks.
 */
class TestModeAuthApiTest {

    @Nested
    @SpringBootTest(properties = {"app.auth.test-mode=true", "app.signup-rate-limit.max-attempts-per-client=1000"})
    @AutoConfigureMockMvc
    class TestModeOn {

        @Autowired
        MockMvc mockMvc;

        @Autowired
        UserRepository userRepository;

        @Autowired
        PasswordEncoder passwordEncoder;

        @BeforeEach
        void setUp() {
            userRepository.deleteAll();
        }

        private ResultActions postJson(String path, String body) throws Exception {
            MockHttpSession session = new MockHttpSession();
            return mockMvc.perform(post(path)
                    .session(session)
                    .header(CSRF_HEADER, csrfToken(mockMvc, session))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body));
        }

        private ResultActions signup(String username, String nickname) throws Exception {
            return postJson("/api/auth/signup", "{\"username\":\"%s\",\"nickname\":\"%s\"}".formatted(username, nickname));
        }

        private ResultActions login(String nickname) throws Exception {
            return postJson("/api/auth/login", "{\"nickname\":\"%s\"}".formatted(nickname));
        }

        @Test
        void signupIsActiveAtOnceAndLoginNeedsOnlyTheNickname() throws Exception {
            signup(" Kim.Student ", " 김학생 ")
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.loginIdentifier").value("kim.student"))
                    .andExpect(jsonPath("$.nickname").value("김학생"))
                    .andExpect(jsonPath("$.status").value("ACTIVE"));

            User user = userRepository.findByNickname("김학생").orElseThrow();
            assertThat(user.getStatus()).isEqualTo(UserStatus.ACTIVE);
            assertThat(user.getRoles()).containsExactly(Role.USER);
            assertThat(user.getPasswordHash()).startsWith("{argon2}");

            login("김학생")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.loginIdentifier").value("kim.student"))
                    .andExpect(jsonPath("$.nickname").value("김학생"));
        }

        @Test
        void loginWithUnknownOrInactiveNicknameGetsTheGenericFailure() throws Exception {
            login("없는사람").andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTHENTICATION_FAILED"));
            login("abc").andExpect(status().isUnauthorized());

            User inactive = User.create("gone", passwordEncoder.encode("Some-Password-12"), Set.of(Role.USER));
            inactive.assignNickname("탈퇴자");
            inactive.deactivate();
            userRepository.save(inactive);
            login("탈퇴자").andExpect(status().isUnauthorized());
        }

        @Test
        void passwordLoginIsNotAcceptedInTestMode() throws Exception {
            userRepository.save(User.create("pw-user", passwordEncoder.encode("Correct-Password-1"), Set.of(Role.USER)));

            postJson("/api/auth/login", "{\"username\":\"pw-user\",\"password\":\"Correct-Password-1\"}")
                    .andExpect(status().isUnauthorized());
        }

        @Test
        void rejectsDuplicateIdentifierAndNickname() throws Exception {
            signup("first-user", "홍길동").andExpect(status().isCreated());

            signup("FIRST-USER", "다른이름")
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("LOGIN_IDENTIFIER_TAKEN"));
            signup("second-user", "홍길동")
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("NICKNAME_TAKEN"));
        }

        @ParameterizedTest
        @ValueSource(strings = {"", "김", "hong", "홍길동1", "홍 길동", "ㄱㄴㄷ", "가나다라마바사아자차카"})
        void rejectsNonHangulNicknames(String nickname) throws Exception {
            signup("valid-user", nickname)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("INVALID_NICKNAME"));
        }

        @Test
        void availabilityChecksEachField() throws Exception {
            signup("taken-id", "사용중").andExpect(status().isCreated());

            mockMvc.perform(get("/api/auth/availability").param("username", "Taken-ID"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.available").value(false));
            mockMvc.perform(get("/api/auth/availability").param("username", "free-id"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.available").value(true));
            mockMvc.perform(get("/api/auth/availability").param("nickname", "사용중"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.available").value(false));
            mockMvc.perform(get("/api/auth/availability").param("nickname", "새이름"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.available").value(true));

            mockMvc.perform(get("/api/auth/availability").param("nickname", "abc"))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_NICKNAME"));
            mockMvc.perform(get("/api/auth/availability").param("username", "ab"))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_LOGIN_IDENTIFIER"));
            mockMvc.perform(get("/api/auth/availability"))
                    .andExpect(status().isBadRequest());
        }
    }

    @Nested
    @SpringBootTest
    @AutoConfigureMockMvc
    class TestModeOff {

        @Autowired
        MockMvc mockMvc;

        @Test
        void availabilityDoesNotExist() throws Exception {
            mockMvc.perform(get("/api/auth/availability").param("username", "anyone"))
                    .andExpect(status().isNotFound());
        }
    }
}
