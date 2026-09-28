package com.myproject.study;

import com.myproject.auth.service.AuthenticatedUser;
import com.myproject.schedule.RewardDtos.RewardResponse;
import com.myproject.schedule.RewardDtos.StudyRewardRequest;
import com.myproject.study.StudyReviewService.DayReview;
import com.myproject.study.StudyReviewService.StudentDay;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/**
 * Study review and study-day rewards (TASK-TIMER-02). Reward managers only (checked in StudyReviewService / RewardService).
 */
@RestController
public class StudyReviewController {

    private final StudyReviewService reviewService;

    public StudyReviewController(StudyReviewService reviewService) {
        this.reviewService = reviewService;
    }

    /**
     * @param date yyyy-MM-dd, default today (Asia/Seoul)
     */
    @GetMapping("/api/study/review")
    public DayReview day(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                         @AuthenticationPrincipal AuthenticatedUser current) {
        return reviewService.day(date, current);
    }

    @GetMapping("/api/study/review/{userId}")
    public StudentDay student(@PathVariable long userId,
                              @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                              @AuthenticationPrincipal AuthenticatedUser current) {
        return reviewService.student(userId, date, current);
    }

    @PostMapping("/api/study/review/{userId}/reward")
    @ResponseStatus(HttpStatus.CREATED)
    public RewardResponse reward(@PathVariable long userId, @Valid @RequestBody StudyRewardRequest request,
                                 @AuthenticationPrincipal AuthenticatedUser current) {
        return reviewService.reward(userId, request, current);
    }
}
