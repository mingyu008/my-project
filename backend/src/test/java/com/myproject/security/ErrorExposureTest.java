package com.myproject.security;

import com.jayway.jsonpath.JsonPath;
import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.CookieManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unhandled server errors go through Boot's /error dispatch, which only exists in a real container.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ErrorExposureTest {

    private static final String SECRET_DETAIL = "SQL [insert into users (password_hash) values ('$argon2id$secret')]";

    @TestConfiguration
    static class FailingEndpoints {
        @Bean
        FailingController failingController() {
            return new FailingController();
        }
    }

    @RestController
    static class FailingController {
        @GetMapping("/api/test/db-error")
        void dbError() {
            throw new DataIntegrityViolationException(SECRET_DETAIL);
        }

        @GetMapping("/api/test/runtime-error")
        void runtimeError() {
            throw new IllegalStateException(SECRET_DETAIL);
        }
    }

    @LocalServerPort
    private int port;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void serverErrorsDoNotExposeExceptionDetails() throws Exception {
        userRepository.findByLoginIdentifier("error-user").ifPresent(userRepository::delete);
        userRepository.save(User.create("error-user", passwordEncoder.encode("Correct-Horse-9!"), Set.of(Role.USER)));
        HttpClient browser = HttpClient.newBuilder().cookieHandler(new CookieManager()).build();
        String csrf = JsonPath.read(browser.send(request("/api/auth/csrf").GET().build(),
                HttpResponse.BodyHandlers.ofString()).body(), "$.token");
        HttpResponse<String> login = browser.send(request("/api/auth/login")
                        .header("Content-Type", "application/json")
                        .header("X-XSRF-TOKEN", csrf)
                        .POST(HttpRequest.BodyPublishers.ofString("{\"username\":\"error-user\",\"password\":\"Correct-Horse-9!\"}"))
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(login.statusCode()).isEqualTo(200);

        for (String path : new String[]{"/api/test/db-error", "/api/test/runtime-error"}) {
            HttpResponse<String> response = browser.send(request(path).GET().build(), HttpResponse.BodyHandlers.ofString());

            assertThat(response.statusCode()).isEqualTo(500);
            assertThat(response.body())
                    .doesNotContain("argon2", "insert into", "SQL", "Exception", "trace", "at com.")
                    .doesNotContainIgnoringCase("stack");
        }
    }

    private HttpRequest.Builder request(String path) {
        return HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
    }
}
