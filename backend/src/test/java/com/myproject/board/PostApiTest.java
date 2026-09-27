package com.myproject.board;

import com.jayway.jsonpath.JsonPath;
import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.Set;

import static com.myproject.support.MockMvcSessions.login;
import static com.myproject.support.MockMvcSessions.withCsrf;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class PostApiTest {

    private static final String PASSWORD = "Correct-Horse-9!";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PostRepository postRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private MockHttpSession alice;
    private MockHttpSession bob;
    private MockHttpSession admin;

    @BeforeEach
    void setUp() throws Exception {
        postRepository.deleteAll();
        userRepository.deleteAll();
        userRepository.save(User.create("alice", passwordEncoder.encode(PASSWORD), Set.of(Role.USER)));
        userRepository.save(User.create("bob", passwordEncoder.encode(PASSWORD), Set.of(Role.USER)));
        userRepository.save(User.create("admin", passwordEncoder.encode(PASSWORD), Set.of(Role.USER, Role.ADMIN)));
        alice = login(mockMvc, "alice", PASSWORD);
        bob = login(mockMvc, "bob", PASSWORD);
        admin = login(mockMvc, "admin", PASSWORD);
    }

    /** Other test classes in this context delete users; posts reference users. */
    @AfterEach
    void tearDown() {
        postRepository.deleteAll();
    }

    private static String body(String title, String content) {
        return "{\"title\":%s,\"content\":%s}".formatted(json(title), json(content));
    }

    private static String json(String value) {
        return value == null ? "null" : "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
    }

    private ResultActions send(MockHttpServletRequestBuilder request, MockHttpSession session, String json) throws Exception {
        MockHttpServletRequestBuilder builder = withCsrf(mockMvc, request, session);
        if (json != null) {
            builder.contentType(MediaType.APPLICATION_JSON).content(json);
        }
        return mockMvc.perform(builder);
    }

    private long createPost(MockHttpSession session, String title) throws Exception {
        String response = send(post("/api/posts"), session, body(title, "content of " + title))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(response, "$.id")).longValue();
    }

    // --- Access ---

    @Test
    void anonymousCannotReadOrWrite() throws Exception {
        mockMvc.perform(get("/api/posts")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/posts/1")).andExpect(status().isUnauthorized());
    }

    @Test
    void writingRequiresCsrfToken() throws Exception {
        mockMvc.perform(post("/api/posts").session(alice).contentType(MediaType.APPLICATION_JSON).content(body("t", "c")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
        assertThat(postRepository.count()).isZero();
    }

    // --- Create / read ---

    @Test
    void createReturnsDetailAndLocation() throws Exception {
        send(post("/api/posts"), alice, body("  Hello  ", "First line\nSecond line"))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", org.hamcrest.Matchers.matchesPattern("/api/posts/\\d+")))
                .andExpect(jsonPath("$.title").value("Hello"))
                .andExpect(jsonPath("$.content").value("First line\nSecond line"))
                .andExpect(jsonPath("$.authorLoginIdentifier").value("alice"))
                .andExpect(jsonPath("$.editable").value(true));
    }

    @Test
    void contentIsStoredAsPlainTextVerbatim() throws Exception {
        String html = "<script>alert('x')</script><img src=x onerror=alert(1)>";
        long id = createPost(alice, "xss");
        send(put("/api/posts/{id}", id), alice, body("xss", html)).andExpect(status().isOk());

        mockMvc.perform(get("/api/posts/{id}", id).session(bob))
                .andExpect(jsonPath("$.content").value(html));
    }

    @Test
    void editableFlagReflectsAuthorOrAdmin() throws Exception {
        long id = createPost(alice, "mine");

        mockMvc.perform(get("/api/posts/{id}", id).session(alice)).andExpect(jsonPath("$.editable").value(true));
        mockMvc.perform(get("/api/posts/{id}", id).session(bob)).andExpect(jsonPath("$.editable").value(false));
        mockMvc.perform(get("/api/posts/{id}", id).session(admin)).andExpect(jsonPath("$.editable").value(true));
    }

    @Test
    void unknownOrMalformedIdIsHandled() throws Exception {
        mockMvc.perform(get("/api/posts/{id}", 999_999).session(alice))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
        mockMvc.perform(get("/api/posts/abc").session(alice)).andExpect(status().isBadRequest());
    }

    // --- Validation ---

    @Test
    void rejectsInvalidInput() throws Exception {
        send(post("/api/posts"), alice, body(" ", "c"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.message").value("Invalid field: title"));
        send(post("/api/posts"), alice, body("t".repeat(201), "c")).andExpect(status().isBadRequest());
        send(post("/api/posts"), alice, body("t", "c".repeat(10_001))).andExpect(status().isBadRequest());
        send(post("/api/posts"), alice, body(null, null))
                .andExpect(jsonPath("$.message").value("Invalid field: content, title"));
        assertThat(postRepository.count()).isZero();
    }

    // --- Paging ---

    @Test
    void listsNewestFirstWithPaging() throws Exception {
        for (int i = 1; i <= 25; i++) {
            createPost(i % 2 == 0 ? alice : bob, "Post " + i);
        }

        mockMvc.perform(get("/api/posts").param("page", "0").param("size", "10").session(alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(10)))
                .andExpect(jsonPath("$.items[0].title").value("Post 25"))
                .andExpect(jsonPath("$.items[0].authorLoginIdentifier").exists())
                .andExpect(jsonPath("$.items[0].content").doesNotExist())
                .andExpect(jsonPath("$.totalElements").value(25))
                .andExpect(jsonPath("$.totalPages").value(3));
        mockMvc.perform(get("/api/posts").param("page", "2").param("size", "10").session(alice))
                .andExpect(jsonPath("$.items", hasSize(5)))
                .andExpect(jsonPath("$.items[4].title").value("Post 1"));
    }

    @Test
    void rejectsInvalidPaging() throws Exception {
        mockMvc.perform(get("/api/posts").param("size", "51").session(alice)).andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/posts").param("size", "0").session(alice)).andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/posts").param("page", "-1").session(alice)).andExpect(status().isBadRequest());
    }

    // --- Update / delete permissions ---

    @Test
    void onlyAuthorOrAdminCanUpdate() throws Exception {
        long id = createPost(alice, "original");

        send(put("/api/posts/{id}", id), bob, body("hijacked", "x"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        assertThat(postRepository.findById(id).orElseThrow().getTitle()).isEqualTo("original");

        send(put("/api/posts/{id}", id), alice, body("edited by author", "x"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("edited by author"));
        send(put("/api/posts/{id}", id), admin, body("edited by admin", "x"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authorLoginIdentifier").value("alice"));
    }

    @Test
    void onlyAuthorOrAdminCanDelete() throws Exception {
        long byAlice = createPost(alice, "a");
        long another = createPost(alice, "b");

        send(delete("/api/posts/{id}", byAlice), bob, null).andExpect(status().isForbidden());
        assertThat(postRepository.existsById(byAlice)).isTrue();

        send(delete("/api/posts/{id}", byAlice), alice, null).andExpect(status().isNoContent());
        mockMvc.perform(get("/api/posts/{id}", byAlice).session(alice)).andExpect(status().isNotFound());

        send(delete("/api/posts/{id}", another), admin, null).andExpect(status().isNoContent());
        send(delete("/api/posts/{id}", another), admin, null).andExpect(status().isNotFound());
    }
}
