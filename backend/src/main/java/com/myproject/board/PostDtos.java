package com.myproject.board;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

/**
 * Board API request/response bodies.
 */
public final class PostDtos {

    private PostDtos() {
    }

    public record PostRequest(
            @NotBlank @Size(max = Post.TITLE_MAX_LENGTH) String title,
            @NotBlank @Size(max = Post.CONTENT_MAX_LENGTH) String content
    ) {
    }

    public record PostSummary(long id, String title, String authorLoginIdentifier, Instant createdAt) {

        static PostSummary from(Post post) {
            return new PostSummary(post.getId(), post.getTitle(), post.getAuthor().getLoginIdentifier(), post.getCreatedAt());
        }
    }

    /**
     * {@code editable} tells the UI whether to show edit/delete; the server re-checks on every change.
     */
    public record PostDetail(
            long id,
            String title,
            String content,
            String authorLoginIdentifier,
            Instant createdAt,
            Instant updatedAt,
            boolean editable
    ) {

        static PostDetail from(Post post, boolean editable) {
            return new PostDetail(post.getId(), post.getTitle(), post.getContent(), post.getAuthor().getLoginIdentifier(),
                    post.getCreatedAt(), post.getUpdatedAt(), editable);
        }
    }

    public record PostPage(List<PostSummary> items, int page, int size, long totalElements, int totalPages) {
    }
}
