package com.myproject.user.repository;

import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.domain.UserStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * Callers must pass a login identifier normalized with {@link User#normalizeLoginIdentifier(String)}.
 */
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByLoginIdentifier(String loginIdentifier);

    boolean existsByLoginIdentifier(String loginIdentifier);

    List<User> findAllByStatusOrderByLoginIdentifierAsc(UserStatus status);

    @Query("select count(u) > 0 from User u join u.roles r where r = :role")
    boolean existsWithRole(@Param("role") Role role);
}
