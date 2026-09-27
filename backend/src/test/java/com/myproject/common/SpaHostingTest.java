package com.myproject.common;

import com.myproject.security.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The React build served from the API origin (test fixture: src/test/resources/static/index.html).
 */
@SpringBootTest
@AutoConfigureMockMvc
class SpaHostingTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void servesTheAppAndClientSideRoutesWithoutLogin() throws Exception {
        // "/" is Boot's welcome page: a forward to index.html (MockMvc does not follow forwards).
        mockMvc.perform(get("/"))
                .andExpect(status().isOk())
                .andExpect(forwardedUrl("index.html"))
                .andExpect(header().string("Content-Security-Policy", SecurityConfig.CONTENT_SECURITY_POLICY));
        for (String path : new String[]{"/index.html", "/schedule/7", "/schedule/calendar", "/login"}) {
            mockMvc.perform(get(path))
                    .andExpect(status().isOk())
                    .andExpect(content().string(containsString("spa-index")))
                    .andExpect(header().string("Content-Security-Policy", SecurityConfig.CONTENT_SECURITY_POLICY))
                    .andExpect(header().string("X-Frame-Options", "DENY"))
                    .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                    .andExpect(header().string("Referrer-Policy", "same-origin"));
        }
    }

    @Test
    void apiAndMissingFilesNeverFallBackToTheApp() throws Exception {
        mockMvc.perform(get("/api/unknown")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/schedules")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/assets/missing-123.js")).andExpect(status().isNotFound());
    }

    @Test
    void nonGetRequestsOutsideTheApiAreRefused() throws Exception {
        mockMvc.perform(post("/schedule/7")).andExpect(status().is4xxClientError());
    }

    @Test
    void healthIsPublicAndSessionless() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(header().doesNotExist("Set-Cookie"));
    }
}
