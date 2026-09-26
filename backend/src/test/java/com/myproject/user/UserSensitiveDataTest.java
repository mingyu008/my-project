package com.myproject.user;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.dto.UserResponse;
import com.myproject.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * passwordHash must never appear in API responses or logs.
 */
@DataJpaTest(properties = {
        "spring.jpa.show-sql=true",
        "logging.level.org.hibernate.SQL=DEBUG"
})
@ExtendWith(OutputCaptureExtension.class)
class UserSensitiveDataTest {

    private static final Logger log = LoggerFactory.getLogger(UserSensitiveDataTest.class);

    private static final String HASH = "$argon2id$v=19$m=16384,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo";

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @Autowired
    private UserRepository userRepository;

    @Test
    void userResponseDoesNotExposePasswordHash() throws Exception {
        User user = userRepository.saveAndFlush(User.create("alice", HASH, Set.of(Role.USER)));

        String json = objectMapper.writeValueAsString(UserResponse.from(user));

        assertThat(json).contains("\"loginIdentifier\":\"alice\"");
        assertThat(json).doesNotContainIgnoringCase("password");
        assertThat(json).doesNotContain(HASH);
        assertThat(UserResponse.class.getRecordComponents())
                .extracting(c -> c.getName().toLowerCase())
                .noneMatch(name -> name.contains("password"));
    }

    @Test
    void entitySerializationDoesNotExposePasswordHash() throws Exception {
        // Entities must not be returned from the API; this is a defense-in-depth check.
        String json = objectMapper.writeValueAsString(User.create("alice", HASH, Set.of(Role.USER)));

        assertThat(json).doesNotContainIgnoringCase("password");
        assertThat(json).doesNotContain(HASH);
    }

    @Test
    void toStringDoesNotContainPasswordHash() {
        User user = User.create("alice", HASH, Set.of(Role.USER));

        assertThat(user.toString()).doesNotContain(HASH).doesNotContainIgnoringCase("password");
        assertThat(UserResponse.from(user).toString()).doesNotContain(HASH);
    }

    @Test
    void persistenceAndLoggingDoNotWritePasswordHash(CapturedOutput output) {
        User saved = userRepository.saveAndFlush(User.create("alice", HASH, Set.of(Role.USER)));
        User found = userRepository.findByLoginIdentifier("alice").orElseThrow();
        log.info("saved user: {}", saved);
        log.info("found user: {}", found);
        log.info("response: {}", UserResponse.from(found));

        assertThat(output.getAll()).contains("loginIdentifier='alice'");
        assertThat(output.getAll()).doesNotContain(HASH);
    }
}
