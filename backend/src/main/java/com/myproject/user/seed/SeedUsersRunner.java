package com.myproject.user.seed;

import com.myproject.user.domain.User;
import com.myproject.user.domain.UserStatus;
import com.myproject.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates the configured users if they do not exist yet. Enabled only with {@code app.seed.enabled=true}
 * and never under the prod profile.
 */
@Component
@Profile("!prod")
@ConditionalOnProperty(name = "app.seed.enabled", havingValue = "true")
@EnableConfigurationProperties(SeedUsersProperties.class)
public class SeedUsersRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedUsersRunner.class);

    private final SeedUsersProperties properties;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public SeedUsersRunner(SeedUsersProperties properties, UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.properties = properties;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        int created = 0;
        for (SeedUsersProperties.SeedUser seed : properties.users()) {
            if (seed.password() == null || seed.password().isBlank()) {
                throw new IllegalStateException("Seed user has no password: " + seed.loginIdentifier());
            }
            String loginIdentifier = User.normalizeLoginIdentifier(seed.loginIdentifier());
            if (userRepository.existsByLoginIdentifier(loginIdentifier)) {
                continue;
            }
            User user = User.create(loginIdentifier, passwordEncoder.encode(seed.password()), seed.roles());
            if (seed.status() == UserStatus.INACTIVE) {
                user.deactivate();
            }
            userRepository.save(user);
            created++;
        }
        log.info("Seed users created: {}", created);
    }
}
