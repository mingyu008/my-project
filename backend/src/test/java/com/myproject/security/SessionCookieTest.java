package com.myproject.security;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Session cookie attributes are applied by the real servlet container, so these tests use a running server.
 */
class SessionCookieTest {

    private static String sessionCookieFromCsrfEndpoint(int port) throws Exception {
        HttpResponse<String> response = HttpClient.newHttpClient().send(
                HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/auth/csrf")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        return response.headers().firstValue("Set-Cookie").orElseThrow();
    }

    @Nested
    @SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
    class Development {

        @LocalServerPort
        int port;

        @Test
        void sessionCookieIsHttpOnlyAndSameSiteLax() throws Exception {
            String cookie = sessionCookieFromCsrfEndpoint(port);

            assertThat(cookie)
                    .startsWith("JSESSIONID=")
                    .contains("HttpOnly", "SameSite=Lax", "Path=/")
                    .doesNotContainIgnoringCase("Domain=");
        }
    }

    @Nested
    @SpringBootTest(
            webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
            properties = "APP_CORS_ALLOWED_ORIGINS=https://app.example.com"
    )
    @ActiveProfiles("prod")
    class Production {

        @LocalServerPort
        int port;

        @Test
        void sessionCookieUsesHostPrefixAndSecure() throws Exception {
            String cookie = sessionCookieFromCsrfEndpoint(port);

            assertThat(cookie)
                    .startsWith("__Host-SESSION=")
                    .contains("Secure", "HttpOnly", "SameSite=Lax", "Path=/")
                    .doesNotContainIgnoringCase("Domain=");
        }
    }
}
