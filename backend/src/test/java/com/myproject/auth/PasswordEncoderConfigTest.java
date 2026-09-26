package com.myproject.auth;

import com.myproject.auth.config.PasswordEncoderConfig;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;

class PasswordEncoderConfigTest {

    private final PasswordEncoder passwordEncoder = new PasswordEncoderConfig().passwordEncoder();

    @Test
    void encodesWithArgon2idAndConfiguredParameters() {
        String hash = passwordEncoder.encode("correct horse battery staple");

        assertThat(hash).startsWith("{argon2}$argon2id$v=19$m=19456,t=2,p=1$");
        assertThat(hash).doesNotContain("correct horse battery staple");
        assertThat(passwordEncoder.upgradeEncoding(hash)).isFalse();
    }

    @Test
    void matchesOnlyTheOriginalPassword() {
        String hash = passwordEncoder.encode("s3cret-Password!");

        assertThat(passwordEncoder.matches("s3cret-Password!", hash)).isTrue();
        assertThat(passwordEncoder.matches("s3cret-password!", hash)).isFalse();
    }

    @Test
    void usesRandomSalt() {
        assertThat(passwordEncoder.encode("same-password"))
                .isNotEqualTo(passwordEncoder.encode("same-password"));
    }
}
