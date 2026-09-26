package com.myproject.user.repository;

import com.myproject.user.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * Callers must pass a login identifier normalized with {@link User#normalizeLoginIdentifier(String)}.
 */
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByLoginIdentifier(String loginIdentifier);

    boolean existsByLoginIdentifier(String loginIdentifier);
}
