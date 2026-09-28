package com.myproject.auth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code app.auth.test-mode} (env AUTH_TEST_MODE): test version of sign-in.
 * <ul>
 *   <li>Signup takes a login identifier and a Hangul nickname, no password; the account is ACTIVE at once.</li>
 *   <li>Login takes the nickname only. Anyone who knows a nickname can sign in as that user,
 *       so this must stay off for real users.</li>
 * </ul>
 * The frontend reads the same switch at build time (VITE_AUTH_TEST_MODE); both must agree.
 */
@ConfigurationProperties("app.auth")
public record AuthModeProperties(@DefaultValue("false") boolean testMode) {
}
