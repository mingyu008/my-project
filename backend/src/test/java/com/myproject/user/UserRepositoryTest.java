package com.myproject.user;

import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.domain.UserStatus;
import com.myproject.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;

import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
class UserRepositoryTest {

    private static final String HASH = "$argon2id$v=19$m=16384,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo";

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TestEntityManager entityManager;

    @Test
    void findsActiveUserByLoginIdentifier() {
        userRepository.saveAndFlush(User.create("alice", HASH, Set.of(Role.USER)));
        entityManager.clear();

        Optional<User> found = userRepository.findByLoginIdentifier("alice");

        assertThat(found).isPresent();
        User user = found.get();
        assertThat(user.getId()).isNotNull();
        assertThat(user.getLoginIdentifier()).isEqualTo("alice");
        assertThat(user.getPasswordHash()).isEqualTo(HASH);
        assertThat(user.getStatus()).isEqualTo(UserStatus.ACTIVE);
        assertThat(user.getRoles()).containsExactly(Role.USER);
        assertThat(user.getCreatedAt()).isNotNull();
        assertThat(user.getUpdatedAt()).isNotNull();
        assertThat(user.canAuthenticate()).isTrue();
    }

    @Test
    void returnsEmptyForUnknownLoginIdentifier() {
        userRepository.saveAndFlush(User.create("alice", HASH, Set.of(Role.USER)));

        assertThat(userRepository.findByLoginIdentifier("nobody")).isEmpty();
        assertThat(userRepository.existsByLoginIdentifier("nobody")).isFalse();
    }

    @Test
    void inactiveUserIsFoundButCannotAuthenticate() {
        User user = User.create("bob", HASH, Set.of(Role.USER));
        user.deactivate();
        userRepository.saveAndFlush(user);
        entityManager.clear();

        User found = userRepository.findByLoginIdentifier("bob").orElseThrow();

        assertThat(found.getStatus()).isEqualTo(UserStatus.INACTIVE);
        assertThat(found.canAuthenticate()).isFalse();
    }

    @Test
    void loginIdentifierIsUnique() {
        userRepository.saveAndFlush(User.create("alice", HASH, Set.of(Role.USER)));

        assertThatThrownBy(() -> userRepository.saveAndFlush(User.create("alice", HASH, Set.of(Role.USER))))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void loginIdentifierUniquenessIgnoresCaseAndSurroundingSpaces() {
        userRepository.saveAndFlush(User.create("alice", HASH, Set.of(Role.USER)));

        assertThatThrownBy(() -> userRepository.saveAndFlush(User.create("  ALICE ", HASH, Set.of(Role.USER))))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void updatedAtChangesOnUpdate() throws InterruptedException {
        User saved = userRepository.saveAndFlush(User.create("alice", HASH, Set.of(Role.USER)));
        var createdAt = saved.getCreatedAt();

        Thread.sleep(5);
        saved.deactivate();
        userRepository.saveAndFlush(saved);

        assertThat(saved.getCreatedAt()).isEqualTo(createdAt);
        assertThat(saved.getUpdatedAt()).isAfter(createdAt);
    }
}
