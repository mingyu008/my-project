package com.myproject.security;

import com.jayway.jsonpath.JsonPath;
import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.CookieManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Real servlet container + cookie jar: the session survives across requests (like a page refresh)
 * and an expired session gets 401.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SessionLifecycleTest {

    private static final String PASSWORD = "Correct-Horse-9!";

    @LocalServerPort
    private int port;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private HttpClient browser;

    /**
     * Test-only endpoint: shortens the current session's timeout so expiry can be tested quickly.
     * (Tomcat's configured timeout has minute granularity.)
     */
    @TestConfiguration
    static class SessionTimeoutTestEndpoint {
        @Bean
        ShortenSessionController shortenSessionController() {
            return new ShortenSessionController();
        }
    }

    @RestController
    static class ShortenSessionController {
        @PostMapping("/api/test/shorten-session")
        void shorten(HttpServletRequest request) {
            request.getSession(false).setMaxInactiveInterval(1);
        }
    }

    @BeforeEach
    void setUp() {
        userRepository.findByLoginIdentifier("session-user").ifPresent(userRepository::delete);
        userRepository.save(User.create("session-user", passwordEncoder.encode(PASSWORD), Set.of(Role.USER)));
        browser = HttpClient.newBuilder().cookieHandler(new CookieManager()).build();
    }

    private HttpResponse<String> get(String path) throws Exception {
        return browser.send(HttpRequest.newBuilder(uri(path)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> post(String path, String csrfToken, String json) throws Exception {
        return browser.send(HttpRequest.newBuilder(uri(path))
                        .header("Content-Type", "application/json")
                        .header("X-XSRF-TOKEN", csrfToken)
                        .POST(HttpRequest.BodyPublishers.ofString(json))
                        .build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String path) {
        return URI.create("http://localhost:" + port + path);
    }

    private String csrfToken() throws Exception {
        return JsonPath.read(get("/api/auth/csrf").body(), "$.token");
    }

    private void login() throws Exception {
        HttpResponse<String> response = post("/api/auth/login", csrfToken(),
                "{\"username\":\"session-user\",\"password\":\"" + PASSWORD + "\"}");
        assertThat(response.statusCode()).isEqualTo(200);
    }

    @Test
    void sessionPersistsAcrossRequests() throws Exception {
        login();

        // Each request is independent, like a browser refresh: only the cookie carries the session.
        assertThat(get("/api/auth/me").statusCode()).isEqualTo(200);
        assertThat(get("/api/grid/data").statusCode()).isEqualTo(200);
        assertThat(get("/api/auth/me").body()).contains("\"loginIdentifier\":\"session-user\"");
    }

    @Test
    void sessionCannotBeReusedAfterLogout() throws Exception {
        login();
        String oldSessionCookie = sessionCookieHeader();

        HttpResponse<String> logout = post("/api/auth/logout", csrfToken(), "");
        assertThat(logout.statusCode()).isEqualTo(204);
        assertThat(logout.headers().firstValue("Set-Cookie")).hasValueSatisfying(c -> assertThat(c).contains("Max-Age=0"));

        assertThat(get("/api/auth/me").statusCode()).isEqualTo(401);
        assertThat(get("/api/grid/data").statusCode()).isEqualTo(401);

        // Replaying the old cookie (e.g. copied before logout) must not work.
        HttpResponse<String> replay = HttpClient.newHttpClient().send(
                HttpRequest.newBuilder(uri("/api/auth/me")).header("Cookie", oldSessionCookie).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(replay.statusCode()).isEqualTo(401);
    }

    private String sessionCookieHeader() {
        return ((CookieManager) browser.cookieHandler().orElseThrow()).getCookieStore().getCookies().stream()
                .filter(c -> c.getName().equals("JSESSIONID"))
                .map(c -> c.getName() + "=" + c.getValue())
                .findFirst().orElseThrow();
    }

    @Test
    void expiredSessionGets401() throws Exception {
        login();
        assertThat(post("/api/test/shorten-session", csrfToken(), "").statusCode()).isEqualTo(200);

        Thread.sleep(2_500);

        HttpResponse<String> me = get("/api/auth/me");
        assertThat(me.statusCode()).isEqualTo(401);
        assertThat(me.body()).contains("UNAUTHENTICATED");
        assertThat(get("/api/grid/data").statusCode()).isEqualTo(401);
    }
}
