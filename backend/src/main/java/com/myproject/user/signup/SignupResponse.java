package com.myproject.user.signup;

import com.myproject.user.domain.UserStatus;

/**
 * @param nickname null outside test mode
 */
public record SignupResponse(String loginIdentifier, String nickname, UserStatus status) {
}
