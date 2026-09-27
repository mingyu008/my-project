package com.myproject.common.web;

/**
 * Authenticated but not allowed to act on this resource (e.g. editing someone else's post).
 */
public class ForbiddenException extends RuntimeException {

    public ForbiddenException() {
        super("Access denied");
    }
}
