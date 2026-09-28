package com.myproject.study;

import com.myproject.auth.service.AuthenticatedUser;
import com.myproject.study.StudyDtos.GoalRequest;
import com.myproject.study.StudyDtos.ManualRequest;
import com.myproject.study.StudyDtos.SessionResponse;
import com.myproject.study.StudyDtos.StartRequest;
import com.myproject.study.StudyDtos.StopRequest;
import com.myproject.study.StudyDtos.SubjectRequest;
import com.myproject.study.StudyDtos.SubjectResponse;
import com.myproject.study.StudyDtos.Summary;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Study timer (TASK-TIMER-01). Any signed-in user, own data only (see StudyService).
 */
@RestController
public class StudyController {

    private final StudyService studyService;

    public StudyController(StudyService studyService) {
        this.studyService = studyService;
    }

    @GetMapping("/api/study/subjects")
    public List<SubjectResponse> subjects(@AuthenticationPrincipal AuthenticatedUser current) {
        return studyService.subjects(current);
    }

    @PostMapping("/api/study/subjects")
    @ResponseStatus(HttpStatus.CREATED)
    public SubjectResponse addSubject(@RequestBody SubjectRequest request, @AuthenticationPrincipal AuthenticatedUser current) {
        return studyService.addSubject(request.name(), current);
    }

    /**
     * @param date yyyy-MM-dd, default today (Asia/Seoul)
     */
    @GetMapping("/api/study/summary")
    public Summary summary(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                           @AuthenticationPrincipal AuthenticatedUser current) {
        return studyService.summary(date, current);
    }

    @PutMapping("/api/study/goal")
    public Map<String, Integer> setGoal(@RequestBody GoalRequest request, @AuthenticationPrincipal AuthenticatedUser current) {
        return Map.of("dailyGoalSec", studyService.setGoal(request.dailyGoalSec(), current));
    }

    /**
     * The open timer session, or 204 when there is none.
     */
    @GetMapping("/api/study/sessions/active")
    public ResponseEntity<SessionResponse> active(@AuthenticationPrincipal AuthenticatedUser current) {
        return studyService.active(current).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping("/api/study/sessions/start")
    @ResponseStatus(HttpStatus.CREATED)
    public SessionResponse start(@RequestBody StartRequest request, @AuthenticationPrincipal AuthenticatedUser current) {
        return studyService.start(request, current);
    }

    @PostMapping("/api/study/sessions/{id}/pause")
    public SessionResponse pause(@PathVariable long id, @AuthenticationPrincipal AuthenticatedUser current) {
        return studyService.pause(id, current);
    }

    @PostMapping("/api/study/sessions/{id}/resume")
    public SessionResponse resume(@PathVariable long id, @AuthenticationPrincipal AuthenticatedUser current) {
        return studyService.resume(id, current);
    }

    @PostMapping("/api/study/sessions/{id}/stop")
    public SessionResponse stop(@PathVariable long id, @RequestBody(required = false) StopRequest request,
                                @AuthenticationPrincipal AuthenticatedUser current) {
        return studyService.stop(id, request, current);
    }

    @DeleteMapping("/api/study/sessions/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void discard(@PathVariable long id, @AuthenticationPrincipal AuthenticatedUser current) {
        studyService.discard(id, current);
    }

    @PostMapping("/api/study/sessions/manual")
    @ResponseStatus(HttpStatus.CREATED)
    public SessionResponse manual(@RequestBody ManualRequest request, @AuthenticationPrincipal AuthenticatedUser current) {
        return studyService.manual(request, current);
    }
}
