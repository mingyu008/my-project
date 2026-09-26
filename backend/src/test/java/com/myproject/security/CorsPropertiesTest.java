package com.myproject.security;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CorsPropertiesTest {

    @ParameterizedTest
    @ValueSource(strings = {
            "*",
            "https://*.example.com",
            "http://localhost:3000/",
            "http://localhost:3000/app",
            "localhost:3000",
            "ftp://localhost:3000",
            "http://user@localhost:3000"
    })
    void rejectsNonExactOrigins(String origin) {
        assertThatThrownBy(() -> new CorsProperties(List.of(origin)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsEmptyList() {
        assertThatThrownBy(() -> new CorsProperties(List.of()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void acceptsExactOrigins() {
        assertThat(new CorsProperties(List.of("http://localhost:3000", "https://app.example.com")).allowedOrigins())
                .containsExactly("http://localhost:3000", "https://app.example.com");
    }
}
