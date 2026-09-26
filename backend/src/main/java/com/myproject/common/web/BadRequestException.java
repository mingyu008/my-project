package com.myproject.common.web;

/**
 * Invalid client input. The message is returned to the client, so it must not contain internal details.
 */
public class BadRequestException extends RuntimeException {

    public BadRequestException(String message) {
        super(message);
    }
}
