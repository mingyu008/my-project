package com.myproject.schedule;

import com.myproject.auth.service.AuthenticatedUser;
import com.myproject.schedule.ScheduleDtos.CalendarResult;
import com.myproject.schedule.ScheduleDtos.ConflictResult;
import com.myproject.schedule.ScheduleDtos.ScheduleDetail;
import com.myproject.schedule.ScheduleDtos.SchedulePage;
import com.myproject.schedule.ScheduleDtos.ScheduleRequest;
import com.myproject.schedule.ScheduleDtos.ScheduleSearch;
import com.myproject.schedule.ScheduleDtos.UserRef;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Protected: any authenticated user (see SecurityConfig). Visibility and ownership checks are in ScheduleService.
 */
@RestController
@RequestMapping("/api/schedules")
public class ScheduleController {

    private final ScheduleService scheduleService;

    public ScheduleController(ScheduleService scheduleService) {
        this.scheduleService = scheduleService;
    }

    @GetMapping
    public SchedulePage list(@RequestParam(required = false) String keyword,
                             @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                             @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                             @RequestParam(required = false) ScheduleStatus status,
                             @RequestParam(required = false) SchedulePriority priority,
                             @RequestParam(required = false) Long assigneeId,
                             @RequestParam(required = false) Long createdById,
                             @RequestParam(defaultValue = "0") int page,
                             @RequestParam(defaultValue = "20") int size,
                             @RequestParam(required = false) String sort,
                             @AuthenticationPrincipal AuthenticatedUser current) {
        ScheduleSearch search = new ScheduleSearch(keyword, from, to, status, priority, assigneeId, createdById);
        return scheduleService.list(search, page, size, sort, current);
    }

    @GetMapping("/conflicts")
    public ConflictResult conflicts(@RequestParam long assigneeId,
                                    @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startAt,
                                    @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endAt,
                                    @RequestParam(required = false) Long excludeId,
                                    @AuthenticationPrincipal AuthenticatedUser current) {
        return scheduleService.conflicts(assigneeId, startAt, endAt, excludeId, current);
    }

    @GetMapping("/calendar")
    public CalendarResult calendar(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                   @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                   @RequestParam(required = false) ScheduleStatus status,
                                   @RequestParam(required = false) Long assigneeId,
                                   @AuthenticationPrincipal AuthenticatedUser current) {
        return scheduleService.calendar(from, to, status, assigneeId, current);
    }

    @GetMapping("/assignees")
    public List<UserRef> assignees() {
        return scheduleService.assignees();
    }

    @GetMapping("/{id}")
    public ScheduleDetail get(@PathVariable long id, @AuthenticationPrincipal AuthenticatedUser current) {
        return scheduleService.get(id, current);
    }

    @PostMapping
    public ResponseEntity<ScheduleDetail> create(@Valid @RequestBody ScheduleRequest request,
                                                 @AuthenticationPrincipal AuthenticatedUser current) {
        ScheduleDetail created = scheduleService.create(request, current);
        return ResponseEntity.created(URI.create("/api/schedules/" + created.id())).body(created);
    }

    @PutMapping("/{id}")
    public ScheduleDetail update(@PathVariable long id, @Valid @RequestBody ScheduleRequest request,
                                 @AuthenticationPrincipal AuthenticatedUser current) {
        return scheduleService.update(id, request, current);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id, @AuthenticationPrincipal AuthenticatedUser current) {
        scheduleService.delete(id, current);
    }
}
