package com.myproject.schedule;

import com.myproject.auth.service.AuthenticatedUser;
import com.myproject.common.web.BadRequestException;
import com.myproject.common.web.ConflictException;
import com.myproject.common.web.ForbiddenException;
import com.myproject.common.web.NotFoundException;
import com.myproject.schedule.ScheduleDtos.CalendarResult;
import com.myproject.schedule.ScheduleDtos.ConflictItem;
import com.myproject.schedule.ScheduleDtos.ConflictResult;
import com.myproject.schedule.ScheduleDtos.ScheduleDetail;
import com.myproject.schedule.ScheduleDtos.SchedulePage;
import com.myproject.schedule.ScheduleDtos.ScheduleRequest;
import com.myproject.schedule.ScheduleDtos.ScheduleSearch;
import com.myproject.schedule.ScheduleDtos.ScheduleSummary;
import com.myproject.schedule.ScheduleDtos.UserRef;
import com.myproject.user.domain.User;
import com.myproject.user.domain.UserStatus;
import com.myproject.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import static com.myproject.schedule.ScheduleAccess.canModify;
import static com.myproject.schedule.ScheduleAccess.canView;
import static com.myproject.schedule.ScheduleAccess.canViewAll;
import static com.myproject.schedule.ScheduleAccess.isAdmin;
import static com.myproject.schedule.ScheduleSpecifications.matches;
import static com.myproject.schedule.ScheduleSpecifications.notDeleted;
import static com.myproject.schedule.ScheduleSpecifications.overlapping;
import static com.myproject.schedule.ScheduleSpecifications.visibleTo;

/**
 * Visibility: ADMIN and CONFIRMER see everything; other users see schedules they created, are assigned to, or that are public.
 * Invisible schedules answer 404 (no existence leak). Only the creator or an ADMIN may change or delete.
 */
@Service
public class ScheduleService {

    public static final int MAX_PAGE_SIZE = 100;
    public static final int MAX_CONFLICT_ITEMS = 20;
    public static final int MAX_CALENDAR_DAYS = 62;
    public static final int MAX_CALENDAR_ITEMS = 500;

    private static final Set<String> SORTABLE_FIELDS =
            Set.of("id", "title", "startAt", "endAt", "status", "priority", "createdAt", "updatedAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.DESC, "startAt");

    private static final Logger log = LoggerFactory.getLogger(ScheduleService.class);

    private final ScheduleRepository scheduleRepository;
    private final UserRepository userRepository;

    public ScheduleService(ScheduleRepository scheduleRepository, UserRepository userRepository) {
        this.scheduleRepository = scheduleRepository;
        this.userRepository = userRepository;
    }

    /**
     * @param sort {@code "field"} or {@code "field,asc|desc"} with a whitelisted field; null for start time descending
     */
    @Transactional(readOnly = true)
    public SchedulePage list(ScheduleSearch search, int page, int size, String sort, AuthenticatedUser current) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BadRequestException("page must be >= 0 and size between 1 and " + MAX_PAGE_SIZE);
        }
        if (search.from() != null && search.to() != null && search.from().isAfter(search.to())) {
            throw new BadRequestException("INVALID_SCHEDULE_PERIOD", "from must not be after to");
        }
        // id as a tie-breaker keeps paging stable when sort values are equal.
        Sort order = parseSort(sort).and(Sort.by(Sort.Direction.DESC, "id"));
        Page<Schedule> result = scheduleRepository.findAll(visible(current).and(matches(search)), PageRequest.of(page, size, order));
        return new SchedulePage(result.map(ScheduleSummary::from).getContent(), page, size,
                result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    public ScheduleDetail get(long id, AuthenticatedUser current) {
        Schedule schedule = findVisible(id, current);
        return ScheduleDetail.from(schedule, canModify(schedule, current));
    }

    @Transactional
    public ScheduleDetail create(ScheduleRequest request, AuthenticatedUser current) {
        requireValidPeriod(request.startAt(), request.endAt());
        User creator = currentUser(current);
        Schedule schedule = scheduleRepository.save(Schedule.create(creator, content(request), request.status()));
        log.info("Schedule created: scheduleId={}, userId={}", schedule.getId(), current.id());
        return ScheduleDetail.from(schedule, true);
    }

    @Transactional
    public ScheduleDetail update(long id, ScheduleRequest request, AuthenticatedUser current) {
        Schedule schedule = findVisible(id, current);
        requireCanModify(schedule, current);
        if (request.version() == null) {
            throw new BadRequestException("Invalid field: version");
        }
        if (request.version() != schedule.getVersion()) {
            throw versionConflict();
        }
        if (!isAdmin(current) && !schedule.getStatus().canChangeTo(request.status())) {
            throw new BadRequestException("INVALID_STATUS_TRANSITION",
                    "Status cannot change from " + schedule.getStatus() + " to " + request.status());
        }
        requireValidPeriod(request.startAt(), request.endAt());

        schedule.update(content(request), request.status(), currentUser(current));
        flush();
        log.info("Schedule updated: scheduleId={}, userId={}", id, current.id());
        return ScheduleDetail.from(schedule, true);
    }

    @Transactional
    public void delete(long id, AuthenticatedUser current) {
        Schedule schedule = findVisible(id, current);
        requireCanModify(schedule, current);
        schedule.markDeleted(currentUser(current));
        flush();
        log.info("Schedule deleted: scheduleId={}, userId={}", id, current.id());
    }

    /**
     * Overlapping schedules of the same assignee. A warning only: saving is never blocked (FR-09).
     */
    @Transactional(readOnly = true)
    public ConflictResult conflicts(long assigneeId, LocalDateTime startAt, LocalDateTime endAt, Long excludeId,
                                    AuthenticatedUser current) {
        requireValidPeriod(startAt, endAt);
        Specification<Schedule> overlaps = notDeleted().and(overlapping(assigneeId, startAt, endAt, excludeId));
        long total = scheduleRepository.count(overlaps);
        if (total == 0) {
            return new ConflictResult(false, List.of(), 0);
        }
        Page<Schedule> visibleItems = scheduleRepository.findAll(visible(current).and(overlaps),
                PageRequest.of(0, MAX_CONFLICT_ITEMS, Sort.by("startAt", "id")));
        List<ConflictItem> items = visibleItems.map(s -> new ConflictItem(s.getId(), s.getTitle(), s.getStartAt(), s.getEndAt()))
                .getContent();
        return new ConflictResult(true, items, total - visibleItems.getTotalElements());
    }

    /**
     * Visible schedules overlapping [from, to] (whole days), oldest start first. At most MAX_CALENDAR_ITEMS.
     */
    @Transactional(readOnly = true)
    public CalendarResult calendar(LocalDate from, LocalDate to, ScheduleStatus status, Long assigneeId,
                                   AuthenticatedUser current) {
        if (from.isAfter(to) || ChronoUnit.DAYS.between(from, to) + 1 > MAX_CALENDAR_DAYS) {
            throw new BadRequestException("INVALID_CALENDAR_RANGE",
                    "from must not be after to and the range must be at most " + MAX_CALENDAR_DAYS + " days");
        }
        ScheduleSearch search = new ScheduleSearch(null, from, to, status, null, assigneeId, null);
        Page<Schedule> result = scheduleRepository.findAll(visible(current).and(matches(search)),
                PageRequest.of(0, MAX_CALENDAR_ITEMS, Sort.by("startAt", "id")));
        return new CalendarResult(result.map(ScheduleSummary::from).getContent(), result.getTotalElements() > MAX_CALENDAR_ITEMS);
    }

    /** Users that can be chosen as assignee (ACTIVE only). */
    @Transactional(readOnly = true)
    public List<UserRef> assignees() {
        return userRepository.findAllByStatusOrderByLoginIdentifierAsc(UserStatus.ACTIVE).stream()
                .map(UserRef::from)
                .toList();
    }

    private Specification<Schedule> visible(AuthenticatedUser current) {
        return canViewAll(current) ? notDeleted() : notDeleted().and(visibleTo(current.id()));
    }

    /** Not deleted and visible to the user, else 404. Also used by RewardService. */
    Schedule findVisible(long id, AuthenticatedUser current) {
        Schedule schedule = scheduleRepository.findWithUsersByIdAndDeletedFalse(id).orElseThrow(NotFoundException::new);
        if (!canView(schedule, current)) {
            throw new NotFoundException();
        }
        return schedule;
    }

    private Schedule.Content content(ScheduleRequest request) {
        return new Schedule.Content(request.title(), request.description(), request.startAt(), request.endAt(),
                request.priority(), assignee(request.assigneeId()), request.location(), request.isPublic(), request.color());
    }

    private User assignee(Long assigneeId) {
        if (assigneeId == null) {
            return null;
        }
        return userRepository.findById(assigneeId)
                .filter(user -> user.getStatus() == UserStatus.ACTIVE)
                .orElseThrow(() -> new BadRequestException("INVALID_ASSIGNEE", "Assignee not found"));
    }

    private User currentUser(AuthenticatedUser current) {
        return userRepository.findById(current.id()).orElseThrow(NotFoundException::new);
    }

    private void flush() {
        try {
            scheduleRepository.flush();
        } catch (ObjectOptimisticLockingFailureException e) {
            throw versionConflict();
        }
    }

    private static ConflictException versionConflict() {
        return new ConflictException("SCHEDULE_VERSION_CONFLICT", "The schedule was changed by someone else");
    }

    private static void requireValidPeriod(LocalDateTime startAt, LocalDateTime endAt) {
        if (!Schedule.isValidPeriod(startAt, endAt)) {
            throw new BadRequestException("INVALID_SCHEDULE_PERIOD", "endAt must not be before startAt");
        }
    }

    private static Sort parseSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return DEFAULT_SORT;
        }
        String[] parts = sort.split(",", -1);
        if (parts.length > 2 || !SORTABLE_FIELDS.contains(parts[0])) {
            throw new BadRequestException("Unsupported sort field");
        }
        if (parts.length == 1) {
            return Sort.by(Sort.Direction.ASC, parts[0]);
        }
        return switch (parts[1].toLowerCase(Locale.ROOT)) {
            case "asc" -> Sort.by(Sort.Direction.ASC, parts[0]);
            case "desc" -> Sort.by(Sort.Direction.DESC, parts[0]);
            default -> throw new BadRequestException("sort direction must be asc or desc");
        };
    }

    private static void requireCanModify(Schedule schedule, AuthenticatedUser current) {
        if (!canModify(schedule, current)) {
            log.info("Schedule modification denied: scheduleId={}, userId={}", schedule.getId(), current.id());
            throw new ForbiddenException();
        }
    }
}
