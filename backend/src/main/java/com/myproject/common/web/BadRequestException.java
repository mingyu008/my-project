package com.myproject.common.web;

/**
 * Invalid client input (400). The message is returned to the client, so it must not contain internal details.
 */
public class BadRequestException extends RuntimeException {

    private final String code;

    public BadRequestException(String message) {
        this("INVALID_REQUEST", message);
    }

    public BadRequestException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
