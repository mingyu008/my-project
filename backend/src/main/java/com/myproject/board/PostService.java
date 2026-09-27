package com.myproject.board;

import com.myproject.auth.service.AuthenticatedUser;
import com.myproject.board.PostDtos.PostDetail;
import com.myproject.board.PostDtos.PostPage;
import com.myproject.board.PostDtos.PostRequest;
import com.myproject.board.PostDtos.PostSummary;
import com.myproject.common.web.BadRequestException;
import com.myproject.common.web.ForbiddenException;
import com.myproject.common.web.NotFoundException;
import com.myproject.user.domain.Role;
import com.myproject.user.domain.User;
import com.myproject.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Any authenticated user may read and write posts; only the author or an ADMIN may change or delete one.
 */
@Service
public class PostService {

    public static final int MAX_PAGE_SIZE = 50;

    private static final Logger log = LoggerFactory.getLogger(PostService.class);

    private final PostRepository postRepository;
    private final UserRepository userRepository;

    public PostService(PostRepository postRepository, UserRepository userRepository) {
        this.postRepository = postRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public PostPage list(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BadRequestException("page must be >= 0 and size between 1 and " + MAX_PAGE_SIZE);
        }
        Page<Post> result = postRepository.findAllBy(PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "id")));
        return new PostPage(result.map(PostSummary::from).getContent(), page, size, result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    public PostDetail get(long id, AuthenticatedUser current) {
        Post post = find(id);
        return PostDetail.from(post, canModify(post, current));
    }

    @Transactional
    public PostDetail create(PostRequest request, AuthenticatedUser current) {
        User author = userRepository.findById(current.id()).orElseThrow(NotFoundException::new);
        Post post = postRepository.save(Post.create(author, request.title(), request.content()));
        log.info("Post created: postId={}, userId={}", post.getId(), current.id());
        return PostDetail.from(post, true);
    }

    @Transactional
    public PostDetail update(long id, PostRequest request, AuthenticatedUser current) {
        Post post = find(id);
        requireCanModify(post, current);
        post.update(request.title(), request.content());
        postRepository.flush();
        log.info("Post updated: postId={}, userId={}", id, current.id());
        return PostDetail.from(post, true);
    }

    @Transactional
    public void delete(long id, AuthenticatedUser current) {
        Post post = find(id);
        requireCanModify(post, current);
        postRepository.delete(post);
        log.info("Post deleted: postId={}, userId={}", id, current.id());
    }

    private Post find(long id) {
        return postRepository.findWithAuthorById(id).orElseThrow(NotFoundException::new);
    }

    private static boolean canModify(Post post, AuthenticatedUser current) {
        return post.isWrittenBy(current.id()) || current.roles().contains(Role.ADMIN);
    }

    private static void requireCanModify(Post post, AuthenticatedUser current) {
        if (!canModify(post, current)) {
            log.info("Post modification denied: postId={}, userId={}", post.getId(), current.id());
            throw new ForbiddenException();
        }
    }
}
