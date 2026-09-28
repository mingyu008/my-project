package com.myproject.user.seed;

import com.myproject.common.web.BadRequestException;
import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.repository.UserRepository;
import com.myproject.user.signup.PasswordPolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;

/**
 * Creates the first ADMIN when {@code app.bootstrap-admin.login-identifier} is set and no ADMIN exists yet
 * (signup needs an ADMIN to approve, so a fresh production database has no other way in).
 * <ul>
 *   <li>Runs in every profile, including prod, but does nothing once any ADMIN exists.</li>
 *   <li>Never promotes an existing account: if the identifier is taken, it only logs a warning.</li>
 *   <li>The password must satisfy the signup policy; otherwise startup fails.</li>
 * </ul>
 */
@Component
@EnableConfigurationProperties(BootstrapAdminProperties.class)
public class BootstrapAdminRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(BootstrapAdminRunner.class);

    private final BootstrapAdminProperties properties;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public BootstrapAdminRunner(BootstrapAdminProperties properties, UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.properties = properties;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!properties.configured()) {
            return;
        }
        if (userRepository.existsWithRole(Role.ADMIN)) {
            log.info("Bootstrap admin skipped: an ADMIN already exists");
            assignNicknameToExistingAdmin();
            return;
        }
        String loginIdentifier = User.normalizeLoginIdentifier(properties.loginIdentifier());
        if (userRepository.existsByLoginIdentifier(loginIdentifier)) {
            log.warn("Bootstrap admin skipped: the login identifier is already used by a non-admin account");
            return;
        }
        try {
            PasswordPolicy.validate(loginIdentifier, properties.password());
        } catch (BadRequestException e) {
            throw new IllegalStateException("Bootstrap admin password rejected: " + e.getMessage());
        }
        User admin = User.create(loginIdentifier, passwordEncoder.encode(properties.password()), Set.of(Role.USER, Role.ADMIN));
        if (properties.hasNickname()) {
            admin.assignNickname(properties.nickname());
        }
        admin = userRepository.save(admin);
        log.info("Bootstrap admin created: userId={}", admin.getId());
    }

    /**
     * Lets an ADMIN created before nicknames existed sign in once test mode is turned on: the configured nickname
     * is given to the configured account only if that account is an ADMIN without a nickname and nobody uses it.
     */
    private void assignNicknameToExistingAdmin() {
        if (!properties.hasNickname()) {
            return;
        }
        String nickname = User.normalizeNickname(properties.nickname());
        userRepository.findByLoginIdentifier(User.normalizeLoginIdentifier(properties.loginIdentifier()))
                .filter(user -> user.getRoles().contains(Role.ADMIN) && user.getNickname() == null)
                .filter(user -> !userRepository.existsByNickname(nickname))
                .ifPresent(user -> {
                    user.assignNickname(nickname);
                    userRepository.save(user);
                    log.info("Bootstrap admin nickname set: userId={}", user.getId());
                });
    }
}
