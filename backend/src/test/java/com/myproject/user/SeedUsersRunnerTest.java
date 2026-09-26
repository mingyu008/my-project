package com.myproject.user;

import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.domain.UserStatus;
import com.myproject.user.repository.UserRepository;
import com.myproject.user.seed.SeedUsersRunner;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

class SeedUsersRunnerTest {

    @Nested
    @SpringBootTest
    @ActiveProfiles("e2e")
    class E2eProfile {

        @Autowired
        UserRepository userRepository;

        @Autowired
        PasswordEncoder passwordEncoder;

        @Test
        void createsConfiguredUsersWithHashedPasswords() {
            User admin = userRepository.findByLoginIdentifier("e2e-admin").orElseThrow();
            assertThat(admin.getRoles()).containsExactlyInAnyOrder(Role.USER, Role.ADMIN);
            assertThat(admin.getPasswordHash()).startsWith("{argon2}").doesNotContain("E2e-Admin-Password-1!");
            assertThat(passwordEncoder.matches("E2e-Admin-Password-1!", admin.getPasswordHash())).isTrue();

            assertThat(userRepository.findByLoginIdentifier("e2e-inactive").orElseThrow().getStatus())
                    .isEqualTo(UserStatus.INACTIVE);
        }
    }

    @Nested
    @SpringBootTest(properties = {
            "APP_CORS_ALLOWED_ORIGINS=https://app.example.com",
            "app.seed.enabled=true",
            "app.seed.users[0].login-identifier=should-not-exist",
            "app.seed.users[0].password=Whatever-1!"
    })
    @ActiveProfiles("prod")
    class ProdProfile {

        @Autowired
        ApplicationContext context;

        @Autowired
        UserRepository userRepository;

        @Test
        void neverSeedsInProd() {
            assertThat(context.getBeansOfType(SeedUsersRunner.class)).isEmpty();
            assertThat(userRepository.existsByLoginIdentifier("should-not-exist")).isFalse();
        }
    }
}
