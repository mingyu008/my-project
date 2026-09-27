package com.myproject.common.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Liveness check for the hosting platform (Render health check). Public, creates no session and does not
 * touch the database, so frequent checks never keep a sleeping free-tier database awake.
 */
@RestController
public class HealthController {

    private static final Map<String, String> UP = Map.of("status", "UP");

    @GetMapping("/api/health")
    public Map<String, String> health() {
        return UP;
    }
}
