package com.myproject.common.web;

/**
 * Request conflicts with the current state (409). The message is returned to the client.
 */
public class ConflictException extends RuntimeException {

    private final String code;

    public ConflictException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
