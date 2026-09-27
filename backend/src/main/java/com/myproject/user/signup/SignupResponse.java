package com.myproject.user.signup;

import com.myproject.user.domain.UserStatus;

public record SignupResponse(String loginIdentifier, UserStatus status) {
}
