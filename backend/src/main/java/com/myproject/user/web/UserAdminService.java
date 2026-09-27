package com.myproject.user.web;

import com.myproject.common.web.ConflictException;
import com.myproject.common.web.NotFoundException;
import com.myproject.user.domain.User;
import com.myproject.user.dto.UserResponse;
import com.myproject.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * ADMIN user management. Access is restricted to ROLE_ADMIN by SecurityConfig (/api/users/**).
 */
@Service
public class UserAdminService {

    private static final Logger log = LoggerFactory.getLogger(UserAdminService.class);

    private final UserRepository userRepository;

    public UserAdminService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<UserResponse> list() {
        return userRepository.findAll(Sort.by("id")).stream().map(UserResponse::from).toList();
    }

    @Transactional
    public UserResponse approve(long userId, long adminId) {
        User user = pendingUser(userId);
        user.approve();
        log.info("Signup approved: userId={}, adminId={}", userId, adminId);
        return UserResponse.from(user);
    }

    /**
     * Removes the signup request so the identifier can be used again.
     */
    @Transactional
    public void reject(long userId, long adminId) {
        User user = pendingUser(userId);
        userRepository.delete(user);
        log.info("Signup rejected: userId={}, adminId={}", userId, adminId);
    }

    private User pendingUser(long userId) {
        User user = userRepository.findById(userId).orElseThrow(NotFoundException::new);
        if (!user.isPending()) {
            throw new ConflictException("USER_NOT_PENDING", "Only pending signups can be approved or rejected");
        }
        return user;
    }
}
