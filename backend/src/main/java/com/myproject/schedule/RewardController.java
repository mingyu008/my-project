package com.myproject.schedule;

import com.myproject.auth.service.AuthenticatedUser;
import com.myproject.schedule.RewardDtos.RewardPage;
import com.myproject.schedule.RewardDtos.RewardRequest;
import com.myproject.schedule.RewardDtos.RewardResponse;
import com.myproject.schedule.RewardDtos.RewardSummary;
import com.myproject.schedule.RewardDtos.ScheduleRewards;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

/**
 * Protected: any authenticated user (see SecurityConfig). Manager and visibility checks are in RewardService.
 */
@RestController
public class RewardController {

    private final RewardService rewardService;

    public RewardController(RewardService rewardService) {
        this.rewardService = rewardService;
    }

    @GetMapping("/api/schedules/{scheduleId}/rewards")
    public ScheduleRewards forSchedule(@PathVariable long scheduleId, @AuthenticationPrincipal AuthenticatedUser current) {
        return rewardService.forSchedule(scheduleId, current);
    }

    @PostMapping("/api/schedules/{scheduleId}/rewards")
    public ResponseEntity<RewardResponse> create(@PathVariable long scheduleId, @Valid @RequestBody RewardRequest request,
                                                 @AuthenticationPrincipal AuthenticatedUser current) {
        RewardResponse created = rewardService.create(scheduleId, request, current);
        return ResponseEntity.created(URI.create("/api/rewards/" + created.id())).body(created);
    }

    @PutMapping("/api/rewards/{rewardId}")
    public RewardResponse update(@PathVariable long rewardId, @Valid @RequestBody RewardRequest request,
                                 @AuthenticationPrincipal AuthenticatedUser current) {
        return rewardService.update(rewardId, request, current);
    }

    @PostMapping("/api/rewards/{rewardId}/pay")
    public RewardResponse pay(@PathVariable long rewardId, @AuthenticationPrincipal AuthenticatedUser current) {
        return rewardService.pay(rewardId, current);
    }

    @PostMapping("/api/rewards/{rewardId}/cancel")
    public RewardResponse cancel(@PathVariable long rewardId, @AuthenticationPrincipal AuthenticatedUser current) {
        return rewardService.cancel(rewardId, current);
    }

    @GetMapping("/api/rewards")
    public RewardPage list(@RequestParam(required = false) RewardStatus status,
                           @RequestParam(required = false) Long recipientId,
                           @RequestParam(defaultValue = "0") int page,
                           @RequestParam(defaultValue = "20") int size,
                           @AuthenticationPrincipal AuthenticatedUser current) {
        return rewardService.list(status, recipientId, page, size, current);
    }

    @GetMapping("/api/rewards/summary")
    public List<RewardSummary> summary(@AuthenticationPrincipal AuthenticatedUser current) {
        return rewardService.summary(current);
    }
}
