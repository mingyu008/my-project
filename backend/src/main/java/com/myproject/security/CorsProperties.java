package com.myproject.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.net.URI;
import java.util.List;

/**
 * Origins allowed to call the API with credentials. Each entry must be an exact origin
 * (scheme://host[:port]); wildcards are rejected.
 */
@ConfigurationProperties("app.cors")
public record CorsProperties(List<String> allowedOrigins) {

    public CorsProperties {
        if (allowedOrigins == null || allowedOrigins.isEmpty()) {
            throw new IllegalArgumentException("app.cors.allowed-origins must not be empty");
        }
        allowedOrigins.forEach(CorsProperties::requireExactOrigin);
        allowedOrigins = List.copyOf(allowedOrigins);
    }

    private static void requireExactOrigin(String origin) {
        if (origin == null || origin.contains("*")) {
            throw new IllegalArgumentException("Wildcard CORS origin is not allowed: " + origin);
        }
        URI uri = URI.create(origin);
        boolean validScheme = "http".equals(uri.getScheme()) || "https".equals(uri.getScheme());
        boolean hasNoPath = uri.getRawPath() == null || uri.getRawPath().isEmpty();
        if (!validScheme || uri.getHost() == null || !hasNoPath || uri.getRawQuery() != null
                || uri.getRawFragment() != null || uri.getRawUserInfo() != null) {
            throw new IllegalArgumentException("CORS origin must be scheme://host[:port]: " + origin);
        }
    }
}
