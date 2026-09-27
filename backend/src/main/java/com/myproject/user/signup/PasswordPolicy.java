package com.myproject.user.signup;

import com.myproject.auth.service.AuthService;
import com.myproject.common.web.BadRequestException;

import java.util.Locale;

/**
 * Server-side rules for new passwords (NIST SP 800-63B style: length over composition rules).
 * The frontend mirrors these for UX only.
 */
public final class PasswordPolicy {

    public static final int MIN_LENGTH = 12;
    public static final int MAX_LENGTH = AuthService.PASSWORD_MAX_LENGTH;

    private PasswordPolicy() {
    }

    /**
     * @throws BadRequestException with code INVALID_PASSWORD; the message never contains the password
     */
    public static void validate(String normalizedLoginIdentifier, String password) {
        if (password == null || password.length() < MIN_LENGTH || password.length() > MAX_LENGTH) {
            throw invalid("Password must be " + MIN_LENGTH + " to " + MAX_LENGTH + " characters");
        }
        if (password.isBlank() || password.chars().distinct().count() == 1) {
            throw invalid("Password is too simple");
        }
        if (password.toLowerCase(Locale.ROOT).contains(normalizedLoginIdentifier)) {
            throw invalid("Password must not contain the login identifier");
        }
    }

    private static BadRequestException invalid(String message) {
        return new BadRequestException("INVALID_PASSWORD", message);
    }
}
