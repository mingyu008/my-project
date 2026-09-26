package com.myproject.user;

import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UserDomainTest {

    private static final String HASH = "$argon2id$v=19$m=16384,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo";

    @Test
    void newUserIsActiveWithNormalizedLoginIdentifier() {
        User user = User.create("  Alice@Example.COM ", HASH, Set.of(Role.USER));

        assertThat(user.getLoginIdentifier()).isEqualTo("alice@example.com");
        assertThat(user.canAuthenticate()).isTrue();
    }

    @Test
    void deactivatedUserCannotAuthenticate() {
        User user = User.create("alice", HASH, Set.of(Role.USER));

        user.deactivate();

        assertThat(user.canAuthenticate()).isFalse();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   "})
    void rejectsBlankLoginIdentifier(String loginIdentifier) {
        assertThatThrownBy(() -> User.create(loginIdentifier, HASH, Set.of(Role.USER)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsTooLongLoginIdentifier() {
        String tooLong = "a".repeat(User.LOGIN_IDENTIFIER_MAX_LENGTH + 1);

        assertThatThrownBy(() -> User.create(tooLong, HASH, Set.of(Role.USER)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   "})
    void rejectsBlankPasswordHash(String passwordHash) {
        assertThatThrownBy(() -> User.create("alice", passwordHash, Set.of(Role.USER)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rolesAreNotModifiableFromOutside() {
        User user = User.create("alice", HASH, Set.of(Role.USER));

        assertThatThrownBy(() -> user.getRoles().add(Role.ADMIN))
                .isInstanceOf(UnsupportedOperationException.class);
    }
}
