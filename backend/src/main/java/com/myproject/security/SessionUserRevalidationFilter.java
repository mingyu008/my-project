package com.myproject.security;

import com.myproject.auth.service.AuthenticatedUser;
import com.myproject.user.domain.User;
import com.myproject.user.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Optional;

/**
 * The session holds a snapshot of the user taken at login. On every authenticated request this filter
 * re-reads the user so that changes take effect immediately:
 * <ul>
 *   <li>user deleted or INACTIVE -> session invalidated, request continues unauthenticated (401)</li>
 *   <li>roles changed -> the session's authorities are replaced</li>
 * </ul>
 * Registered only inside the security filter chain (not a {@code @Component}), after the SecurityContext is loaded.
 */
public class SessionUserRevalidationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(SessionUserRevalidationFilter.class);

    private final UserRepository userRepository;
    private final SecurityContextRepository securityContextRepository;
    private final SecurityContextHolderStrategy securityContextHolderStrategy =
            SecurityContextHolder.getContextHolderStrategy();

    public SessionUserRevalidationFilter(UserRepository userRepository, SecurityContextRepository securityContextRepository) {
        this.userRepository = userRepository;
        this.securityContextRepository = securityContextRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication authentication = securityContextHolderStrategy.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser principal) {
            Optional<User> current = userRepository.findById(principal.id());
            if (current.isEmpty() || !current.get().canAuthenticate()) {
                log.info("Session revoked: userId={}, reason={}", principal.id(), current.isEmpty() ? "USER_DELETED" : "INACTIVE");
                HttpSession session = request.getSession(false);
                if (session != null) {
                    session.invalidate();
                }
                securityContextHolderStrategy.clearContext();
            } else if (!current.get().getRoles().equals(principal.roles())) {
                AuthenticatedUser refreshed = AuthenticatedUser.from(current.get());
                SecurityContext context = securityContextHolderStrategy.createEmptyContext();
                context.setAuthentication(SessionAuthentication.of(refreshed));
                securityContextHolderStrategy.setContext(context);
                securityContextRepository.saveContext(context, request, response);
                log.info("Session roles refreshed: userId={}", principal.id());
            }
        }
        chain.doFilter(request, response);
    }
}
