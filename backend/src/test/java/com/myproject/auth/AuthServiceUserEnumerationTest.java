package com.myproject.auth;

import com.myproject.auth.service.AuthService;
import com.myproject.auth.service.AuthenticationFailedException;
import com.myproject.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * An unknown user must cost the same password hash verification as an existing one,
 * so response time does not reveal whether the account exists.
 */
class AuthServiceUserEnumerationTest {

    @Test
    void unknownUserStillVerifiesAgainstDummyHash() {
        UserRepository userRepository = mock(UserRepository.class);
        PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
        when(passwordEncoder.encode(anyString())).thenReturn("{argon2}dummy");
        when(userRepository.findByLoginIdentifier("nobody")).thenReturn(Optional.empty());
        AuthService authService = new AuthService(userRepository, passwordEncoder);

        assertThatThrownBy(() -> authService.authenticate("nobody", "some-password"))
                .isInstanceOf(AuthenticationFailedException.class);

        verify(passwordEncoder).matches("some-password", "{argon2}dummy");
    }
}
