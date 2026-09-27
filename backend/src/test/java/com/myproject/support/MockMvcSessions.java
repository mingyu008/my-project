package com.myproject.support;

import com.jayway.jsonpath.JsonPath;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Real login flow (csrf -> login) for MockMvc tests.
 */
public final class MockMvcSessions {

    public static final String CSRF_HEADER = "X-XSRF-TOKEN";

    private MockMvcSessions() {
    }

    public static String csrfToken(MockMvc mockMvc, MockHttpSession session) throws Exception {
        return JsonPath.read(mockMvc.perform(get("/api/auth/csrf").session(session))
                .andReturn().getResponse().getContentAsString(), "$.token");
    }

    public static MockHttpSession login(MockMvc mockMvc, String username, String password) throws Exception {
        MockHttpSession session = new MockHttpSession();
        mockMvc.perform(post("/api/auth/login")
                        .session(session)
                        .header(CSRF_HEADER, csrfToken(mockMvc, session))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"%s\",\"password\":\"%s\"}".formatted(username, password)))
                .andExpect(status().isOk());
        return session;
    }

    /**
     * Adds the session and a fresh CSRF token for a state-changing request.
     */
    public static MockHttpServletRequestBuilder withCsrf(MockMvc mockMvc, MockHttpServletRequestBuilder request,
                                                         MockHttpSession session) throws Exception {
        return request.session(session).header(CSRF_HEADER, csrfToken(mockMvc, session));
    }
}
