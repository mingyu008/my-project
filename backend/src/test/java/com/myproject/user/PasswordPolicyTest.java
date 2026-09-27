package com.myproject.user;

import com.myproject.common.web.BadRequestException;
import com.myproject.user.signup.PasswordPolicy;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

class PasswordPolicyTest {

    @Test
    void acceptsLongEnoughPassword() {
        assertThatCode(() -> PasswordPolicy.validate("alice", "correct horse battery")).doesNotThrowAnyException();
        assertThatCode(() -> PasswordPolicy.validate("alice", "x".repeat(11) + "y")).doesNotThrowAnyException();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"short-pw-1", "            ", "aaaaaaaaaaaaaaaa", "my-Alice-password", "ALICE12345678"})
    void rejectsWeakPasswords(String password) {
        BadRequestException e = catchThrowableOfType(() -> PasswordPolicy.validate("alice", password), BadRequestException.class);

        assertThat(e).isNotNull();
        assertThat(e.getCode()).isEqualTo("INVALID_PASSWORD");
        if (password != null && !password.isEmpty()) {
            assertThat(e.getMessage()).doesNotContain(password);
        }
    }

    @Test
    void rejectsTooLongPassword() {
        assertThat(catchThrowableOfType(() -> PasswordPolicy.validate("alice", "p".repeat(128) + "q"), BadRequestException.class))
                .isNotNull();
    }
}
