package com.myproject.user.web;

import com.myproject.auth.service.AuthenticatedUser;
import com.myproject.user.dto.UserResponse;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Protected: ADMIN only (see SecurityConfig).
 */
@RestController
public class UserController {

    private final UserAdminService userAdminService;

    public UserController(UserAdminService userAdminService) {
        this.userAdminService = userAdminService;
    }

    @GetMapping("/api/users")
    public List<UserResponse> list() {
        return userAdminService.list();
    }

    @PostMapping("/api/users/{id}/approve")
    public UserResponse approve(@PathVariable long id, @AuthenticationPrincipal AuthenticatedUser admin) {
        return userAdminService.approve(id, admin.id());
    }

    @PostMapping("/api/users/{id}/reject")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reject(@PathVariable long id, @AuthenticationPrincipal AuthenticatedUser admin) {
        userAdminService.reject(id, admin.id());
    }

    @PutMapping("/api/users/{id}/roles/confirmer")
    public UserResponse grantConfirmer(@PathVariable long id, @AuthenticationPrincipal AuthenticatedUser admin) {
        return userAdminService.setConfirmer(id, true, admin.id());
    }

    @DeleteMapping("/api/users/{id}/roles/confirmer")
    public UserResponse revokeConfirmer(@PathVariable long id, @AuthenticationPrincipal AuthenticatedUser admin) {
        return userAdminService.setConfirmer(id, false, admin.id());
    }
}
