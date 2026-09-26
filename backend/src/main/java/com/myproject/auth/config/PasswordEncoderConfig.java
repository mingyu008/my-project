package com.myproject.auth.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Map;

@Configuration
public class PasswordEncoderConfig {

    public static final String ENCODING_ID = "argon2";

    // Argon2id parameters: OWASP Password Storage Cheat Sheet minimum (m=19 MiB, t=2, p=1).
    static final int SALT_LENGTH = 16;
    static final int HASH_LENGTH = 32;
    static final int PARALLELISM = 1;
    static final int MEMORY_KIB = 19 * 1024;
    static final int ITERATIONS = 2;

    /**
     * Stored hashes look like {@code {argon2}$argon2id$v=19$m=19456,t=2,p=1$...}.
     * The {@code {id}} prefix lets the algorithm or its parameters change later without
     * invalidating existing hashes; outdated hashes are re-encoded on successful login.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        Map<String, PasswordEncoder> encoders = Map.of(
                ENCODING_ID,
                new Argon2PasswordEncoder(SALT_LENGTH, HASH_LENGTH, PARALLELISM, MEMORY_KIB, ITERATIONS)
        );
        return new DelegatingPasswordEncoder(ENCODING_ID, encoders);
    }
}
