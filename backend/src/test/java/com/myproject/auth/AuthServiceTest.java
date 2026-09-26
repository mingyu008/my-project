package com.myproject.auth;

import com.myproject.auth.config.PasswordEncoderConfig;
import com.myproject.auth.service.AuthService;
import com.myproject.auth.service.AuthenticatedUser;
import com.myproject.auth.service.AuthenticationFailedException;
import com.myproject.auth.service.AuthenticationFailedException.Reason;
import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

@DataJpaTest(properties = {
        "spring.jpa.show-sql=true",
        "logging.level.org.hibernate.SQL=DEBUG"
})
@Import({PasswordEncoderConfig.class, AuthService.class})
@ExtendWith(OutputCaptureExtension.class)
class AuthServiceTest {

    private static final String PASSWORD = "Correct-Horse-9!";

    @Autowired
    private AuthService authService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private TestEntityManager entityManager;

    private User saveUser(String loginIdentifier, String rawPassword) {
        return userRepository.saveAndFlush(
                User.create(loginIdentifier, passwordEncoder.encode(rawPassword), Set.of(Role.USER)));
    }

    private static AuthenticationFailedException failure(Runnable call) {
        return catchThrowableOfType(call::run, AuthenticationFailedException.class);
    }

    @Test
    void authenticatesActiveUserWithCorrectPassword() {
        User saved = saveUser("alice", PASSWORD);

        AuthenticatedUser result = authService.authenticate("alice", PASSWORD);

        assertThat(result.id()).isEqualTo(saved.getId());
        assertThat(result.loginIdentifier()).isEqualTo("alice");
        assertThat(result.roles()).containsExactly(Role.USER);
    }

    @Test
    void loginIdentifierIsMatchedCaseInsensitively() {
        saveUser("alice", PASSWORD);

        assertThat(authService.authenticate("  ALICE ", PASSWORD).loginIdentifier()).isEqualTo("alice");
    }

    @Test
    void rejectsWrongPassword() {
        saveUser("alice", PASSWORD);

        AuthenticationFailedException e = failure(() -> authService.authenticate("alice", "wrong-password"));

        assertThat(e).isNotNull();
        assertThat(e.getReason()).isEqualTo(Reason.BAD_CREDENTIALS);
    }

    @Test
    void rejectsUnknownUser() {
        AuthenticationFailedException e = failure(() -> authService.authenticate("nobody", PASSWORD));

        assertThat(e).isNotNull();
        assertThat(e.getReason()).isEqualTo(Reason.USER_NOT_FOUND);
    }

    @Test
    void rejectsInactiveUserEvenWithCorrectPassword() {
        User user = saveUser("bob", PASSWORD);
        user.deactivate();
        userRepository.saveAndFlush(user);

        AuthenticationFailedException e = failure(() -> authService.authenticate("bob", PASSWORD));

        assertThat(e).isNotNull();
        assertThat(e.getReason()).isEqualTo(Reason.INACTIVE);
    }

    @Test
    void inactiveUserWithWrongPasswordDoesNotRevealStatus() {
        User user = saveUser("bob", PASSWORD);
        user.deactivate();
        userRepository.saveAndFlush(user);

        AuthenticationFailedException e = failure(() -> authService.authenticate("bob", "wrong-password"));

        assertThat(e.getReason()).isEqualTo(Reason.BAD_CREDENTIALS);
    }

    @ParameterizedTest
    @NullAndEmptySource
    void rejectsMissingPassword(String rawPassword) {
        saveUser("alice", PASSWORD);

        assertThat(failure(() -> authService.authenticate("alice", rawPassword)).getReason())
                .isEqualTo(Reason.INVALID_INPUT);
    }

    @Test
    void rejectsOverlongPasswordWithoutHashing() {
        String overlong = "a".repeat(AuthService.PASSWORD_MAX_LENGTH + 1);

        assertThat(failure(() -> authService.authenticate("alice", overlong)).getReason())
                .isEqualTo(Reason.INVALID_INPUT);
    }

    @ParameterizedTest
    @NullAndEmptySource
    void treatsInvalidLoginIdentifierAsUnknownUser(String loginIdentifier) {
        assertThat(failure(() -> authService.authenticate(loginIdentifier, PASSWORD)).getReason())
                .isEqualTo(Reason.USER_NOT_FOUND);
    }

    @Test
    void storedHashWithoutEncodingIdFailsSafely() {
        String unprefixed = new Argon2PasswordEncoder(16, 32, 1, 19456, 2).encode(PASSWORD);
        userRepository.saveAndFlush(User.create("legacy", unprefixed, Set.of(Role.USER)));

        assertThat(failure(() -> authService.authenticate("legacy", PASSWORD)).getReason())
                .isEqualTo(Reason.UNREADABLE_PASSWORD_HASH);
    }

    @Test
    void allFailuresExposeTheSameMessage() {
        User inactive = saveUser("bob", PASSWORD);
        inactive.deactivate();
        userRepository.saveAndFlush(inactive);
        saveUser("alice", PASSWORD);

        assertThat(List.of(
                failure(() -> authService.authenticate("alice", "wrong-password")).getMessage(),
                failure(() -> authService.authenticate("nobody", PASSWORD)).getMessage(),
                failure(() -> authService.authenticate("bob", PASSWORD)).getMessage(),
                failure(() -> authService.authenticate("alice", "")).getMessage()
        )).containsOnly(AuthenticationFailedException.MESSAGE);
    }

    @Test
    void reencodesOutdatedHashOnSuccessfulLogin() {
        String weakHash = "{argon2}" + new Argon2PasswordEncoder(16, 32, 1, 4096, 1).encode(PASSWORD);
        User user = userRepository.saveAndFlush(User.create("carol", weakHash, Set.of(Role.USER)));

        authService.authenticate("carol", PASSWORD);
        entityManager.flush();
        entityManager.clear();

        String newHash = userRepository.findById(user.getId()).orElseThrow().getPasswordHash();
        assertThat(newHash).isNotEqualTo(weakHash).startsWith("{argon2}$argon2id$v=19$m=19456,t=2,p=1$");
        assertThat(passwordEncoder.matches(PASSWORD, newHash)).isTrue();
    }

    @Test
    void doesNotLogPasswordHashOrLoginIdentifier(CapturedOutput output) {
        String rawPassword = "Log-Check-Password-42";
        User user = saveUser("log-check-user", rawPassword);
        User inactive = saveUser("log-check-inactive", rawPassword);
        inactive.deactivate();
        userRepository.saveAndFlush(inactive);

        authService.authenticate("log-check-user", rawPassword);
        failure(() -> authService.authenticate("log-check-user", "Wrong-Log-Check-Password"));
        failure(() -> authService.authenticate("log-check-unknown", rawPassword));
        failure(() -> authService.authenticate("log-check-inactive", rawPassword));
        // Password typed into the identifier field by mistake
        failure(() -> authService.authenticate(rawPassword, rawPassword));

        String logs = output.getAll();
        assertThat(logs).contains("Authentication succeeded", "Authentication failed");
        assertThat(logs).doesNotContain(rawPassword.toLowerCase(), rawPassword, "Wrong-Log-Check-Password");
        assertThat(logs).doesNotContain(user.getPasswordHash(), inactive.getPasswordHash());
        assertThat(logs).doesNotContain("log-check-");
    }

    @Test
    void authenticatedUserCarriesNoPassword() {
        assertThat(AuthenticatedUser.class.getRecordComponents())
                .extracting(c -> c.getName().toLowerCase())
                .noneMatch(name -> name.contains("password"));
    }
}
