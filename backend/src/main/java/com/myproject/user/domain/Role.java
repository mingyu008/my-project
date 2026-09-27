package com.myproject.user.domain;

public enum Role {
    USER,
    ADMIN,
    /** Schedule reward manager ("확인자"). Granted and revoked by an ADMIN. */
    CONFIRMER
}
