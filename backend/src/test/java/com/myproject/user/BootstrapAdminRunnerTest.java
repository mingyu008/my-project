package com.myproject.user;

import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.repository.UserRepository;
import com.myproject.user.seed.BootstrapAdminProperties;
import com.myproject.user.seed.BootstrapAdminRunner;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class BootstrapAdminRunnerTest {

    private static final String PASSWORD = "Bootstrap-Admin-Pass-9";

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();
    }

    private void run(String loginIdentifier, String password) {
        new BootstrapAdminRunner(new BootstrapAdminProperties(loginIdentifier, password), userRepository, passwordEncoder).run(null);
    }

    @Test
    void createsTheFirstAdminOnce() {
        run("  Boss ", PASSWORD);

        User admin = userRepository.findByLoginIdentifier("boss").orElseThrow();
        assertThat(admin.getRoles()).containsExactlyInAnyOrder(Role.USER, Role.ADMIN);
        assertThat(admin.canAuthenticate()).isTrue();
        assertThat(passwordEncoder.matches(PASSWORD, admin.getPasswordHash())).isTrue();

        // Restarts with the same settings change nothing.
        run("boss", "Another-Strong-Pass-1");
        assertThat(userRepository.count()).isEqualTo(1);
        assertThat(passwordEncoder.matches(PASSWORD, userRepository.findByLoginIdentifier("boss").orElseThrow().getPasswordHash())).isTrue();
    }

    @Test
    void doesNothingWhenNotConfiguredOrAnAdminExists() {
        run("", PASSWORD);
        run(null, null);
        assertThat(userRepository.count()).isZero();

        userRepository.save(User.create("existing-admin", passwordEncoder.encode(PASSWORD), Set.of(Role.USER, Role.ADMIN)));
        run("boss", PASSWORD);
        assertThat(userRepository.existsByLoginIdentifier("boss")).isFalse();
    }

    @Test
    void neverPromotesAnExistingAccount() {
        userRepository.save(User.create("boss", passwordEncoder.encode("Member-Password-1"), Set.of(Role.USER)));

        run("boss", PASSWORD);

        assertThat(userRepository.findByLoginIdentifier("boss").orElseThrow().getRoles()).containsExactly(Role.USER);
    }

    @Test
    void rejectsAWeakPasswordWithoutEchoingIt() {
        assertThatThrownBy(() -> run("boss", "short"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Bootstrap admin password rejected")
                .hasMessageNotContaining("short");
        assertThatThrownBy(() -> run("boss", "boss-is-the-password"))
                .isInstanceOf(IllegalStateException.class);
        assertThat(userRepository.count()).isZero();
    }
}
