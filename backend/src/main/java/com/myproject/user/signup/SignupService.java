package com.myproject.user.signup;

import com.myproject.common.web.BadRequestException;
import com.myproject.common.web.ConflictException;
import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;
import java.util.regex.Pattern;

/**
 * Self-service signup. New accounts are PENDING with role USER until an ADMIN approves them.
 */
@Service
public class SignupService {

    /** Applied after normalization (trim + lower case). */
    static final Pattern LOGIN_IDENTIFIER_PATTERN = Pattern.compile("[a-z0-9._-]{4,30}");

    private static final Logger log = LoggerFactory.getLogger(SignupService.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public SignupService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * Reports a taken identifier (409): unavoidable for username-based signup without e-mail verification.
     * Probing is bounded by {@link SignupRateLimiter}.
     */
    @Transactional
    public SignupResponse signup(String requestedLoginIdentifier, String password) {
        String loginIdentifier = validLoginIdentifier(requestedLoginIdentifier);
        PasswordPolicy.validate(loginIdentifier, password);

        if (userRepository.existsByLoginIdentifier(loginIdentifier)) {
            throw taken();
        }
        User user;
        try {
            user = userRepository.saveAndFlush(
                    User.createPending(loginIdentifier, passwordEncoder.encode(password), Set.of(Role.USER)));
        } catch (DataIntegrityViolationException e) {
            // Concurrent signup with the same identifier.
            throw taken();
        }
        log.info("Signup: userId={} (pending approval)", user.getId());
        return new SignupResponse(user.getLoginIdentifier(), user.getStatus());
    }

    private static String validLoginIdentifier(String requested) {
        String normalized;
        try {
            normalized = User.normalizeLoginIdentifier(requested);
        } catch (IllegalArgumentException e) {
            throw invalidIdentifier();
        }
        if (!LOGIN_IDENTIFIER_PATTERN.matcher(normalized).matches()) {
            throw invalidIdentifier();
        }
        return normalized;
    }

    private static BadRequestException invalidIdentifier() {
        return new BadRequestException("INVALID_LOGIN_IDENTIFIER",
                "Login identifier must be 4 to 30 characters of a-z, 0-9, dot, underscore or hyphen");
    }

    private static ConflictException taken() {
        return new ConflictException("LOGIN_IDENTIFIER_TAKEN", "Login identifier is already in use");
    }
}
