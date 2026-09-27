package com.myproject.common.web;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;

/**
 * Serves the React build (copied to classpath:/static/ by the Docker build) from the same origin as the API,
 * so the session cookie stays first-party (DECISIONS D-040).
 * <p>
 * Unknown non-API paths (client-side routes such as /schedule/7) get index.html; /api/** never falls back.
 * Without a bundled frontend (local development, tests) nothing changes: unknown paths stay 404.
 */
@Configuration
public class SpaWebConfig implements WebMvcConfigurer {

    private static final String STATIC = "classpath:/static/";
    private static final Resource INDEX = new ClassPathResource("static/index.html");

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations(STATIC)
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String resourcePath, Resource location) throws IOException {
                        // "" and "dir/" would resolve to a directory, not a file.
                        if (!resourcePath.isEmpty() && !resourcePath.endsWith("/")) {
                            Resource resource = location.createRelative(resourcePath);
                            if (resource.exists() && resource.isReadable()) {
                                return resource;
                            }
                        }
                        // Missing files with an extension (e.g. an old /assets/x.js) are real 404s, not routes.
                        if (resourcePath.startsWith("api/") || resourcePath.contains(".")) {
                            return null;
                        }
                        return INDEX.exists() ? INDEX : null;
                    }
                });
    }
}
