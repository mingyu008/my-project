package com.myproject.auth.service;

import com.myproject.auth.service.AuthenticationFailedException.Reason;
import com.myproject.user.domain.User;
import com.myproject.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

/**
 * Verifies a login identifier and raw password against the stored passwordHash.
 * <p>
 * Never logs the raw password, the passwordHash, or the submitted login identifier
 * (users sometimes type their password into the identifier field).
 */
@Service
public class AuthService {

    /** Bounds the hashing work an unauthenticated caller can trigger. */
    public static final int PASSWORD_MAX_LENGTH = 128;

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    /** Verified against when the user does not exist, so both paths cost one hash computation. */
    private final String dummyPasswordHash;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.dummyPasswordHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    /**
     * @throws AuthenticationFailedException for any failure, always with the same message
     */
    @Transactional
    public AuthenticatedUser authenticate(String loginIdentifier, String rawPassword) {
        if (rawPassword == null || rawPassword.isEmpty() || rawPassword.length() > PASSWORD_MAX_LENGTH) {
            throw failure(Reason.INVALID_INPUT, null);
        }

        Optional<User> found = findUser(loginIdentifier);
        if (found.isEmpty()) {
            passwordEncoder.matches(rawPassword, dummyPasswordHash);
            throw failure(Reason.USER_NOT_FOUND, null);
        }

        User user = found.get();
        boolean matches;
        try {
            matches = passwordEncoder.matches(rawPassword, user.getPasswordHash());
        } catch (IllegalArgumentException e) {
            // Unknown encoding id or malformed hash. The exception message may contain the hash, so drop it.
            throw failure(Reason.UNREADABLE_PASSWORD_HASH, user.getId());
        }
        if (!matches) {
            throw failure(Reason.BAD_CREDENTIALS, user.getId());
        }
        // Checked only after the password so that account status is not revealed to someone without it.
        if (!user.canAuthenticate()) {
            throw failure(user.isPending() ? Reason.PENDING_APPROVAL : Reason.INACTIVE, user.getId());
        }

        if (passwordEncoder.upgradeEncoding(user.getPasswordHash())) {
            user.changePasswordHash(passwordEncoder.encode(rawPassword));
            log.info("Password hash re-encoded with current parameters: userId={}", user.getId());
        }

        log.info("Authentication succeeded: userId={}", user.getId());
        return AuthenticatedUser.from(user);
    }

    /**
     * Test mode only (AuthModeProperties): the nickname alone identifies and authenticates the user.
     *
     * @throws AuthenticationFailedException for any failure, always with the same message
     */
    @Transactional(readOnly = true)
    public AuthenticatedUser authenticateByNickname(String nickname) {
        Optional<User> found;
        try {
            found = userRepository.findByNickname(User.normalizeNickname(nickname));
        } catch (IllegalArgumentException e) {
            throw failure(Reason.INVALID_INPUT, null);
        }
        if (found.isEmpty()) {
            throw failure(Reason.USER_NOT_FOUND, null);
        }
        User user = found.get();
        if (!user.canAuthenticate()) {
            throw failure(user.isPending() ? Reason.PENDING_APPROVAL : Reason.INACTIVE, user.getId());
        }
        log.info("Authentication succeeded (test mode, nickname): userId={}", user.getId());
        return AuthenticatedUser.from(user);
    }

    private Optional<User> findUser(String loginIdentifier) {
        String normalized;
        try {
            normalized = User.normalizeLoginIdentifier(loginIdentifier);
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
        return userRepository.findByLoginIdentifier(normalized);
    }

    private static AuthenticationFailedException failure(Reason reason, Long userId) {
        log.info("Authentication failed: reason={}, userId={}", reason, userId);
        return new AuthenticationFailedException(reason);
    }
}
