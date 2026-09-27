package com.myproject.common.web;

public class NotFoundException extends RuntimeException {

    public NotFoundException() {
        super("Not found");
    }
}
