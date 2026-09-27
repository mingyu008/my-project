package com.myproject.board;

import com.myproject.auth.service.AuthenticatedUser;
import com.myproject.board.PostDtos.PostDetail;
import com.myproject.board.PostDtos.PostPage;
import com.myproject.board.PostDtos.PostRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

/**
 * Protected: any authenticated user (see SecurityConfig). Ownership checks are in PostService.
 */
@RestController
@RequestMapping("/api/posts")
public class PostController {

    private final PostService postService;

    public PostController(PostService postService) {
        this.postService = postService;
    }

    @GetMapping
    public PostPage list(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return postService.list(page, size);
    }

    @GetMapping("/{id}")
    public PostDetail get(@PathVariable long id, @AuthenticationPrincipal AuthenticatedUser current) {
        return postService.get(id, current);
    }

    @PostMapping
    public ResponseEntity<PostDetail> create(@Valid @RequestBody PostRequest request,
                                             @AuthenticationPrincipal AuthenticatedUser current) {
        PostDetail created = postService.create(request, current);
        return ResponseEntity.created(URI.create("/api/posts/" + created.id())).body(created);
    }

    @PutMapping("/{id}")
    public PostDetail update(@PathVariable long id, @Valid @RequestBody PostRequest request,
                             @AuthenticationPrincipal AuthenticatedUser current) {
        return postService.update(id, request, current);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id, @AuthenticationPrincipal AuthenticatedUser current) {
        postService.delete(id, current);
    }
}
