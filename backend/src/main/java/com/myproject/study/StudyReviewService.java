package com.myproject.study;

import com.myproject.auth.service.AuthenticatedUser;
import com.myproject.common.web.BadRequestException;
import com.myproject.common.web.NotFoundException;
import com.myproject.schedule.RewardDtos.RewardResponse;
import com.myproject.schedule.RewardDtos.StudyRewardRequest;
import com.myproject.schedule.RewardService;
import com.myproject.user.domain.User;
import com.myproject.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Study review for reward managers (CONFIRMER or ADMIN, TASK-TIMER-02): everyone's study time per day, each
 * student's records, and a reward for the day. Timer and hand-entered (MANUAL) time are reported separately so the
 * manager can judge self-reported time. Everyone else gets 403.
 */
@Service
public class StudyReviewService {

    private static final ZoneId ZONE = StudyService.ZONE;

    private final StudySessionRepository sessionRepository;
    private final UserRepository userRepository;
    private final RewardService rewardService;
    private final Clock clock;

    public StudyReviewService(StudySessionRepository sessionRepository, UserRepository userRepository, RewardService rewardService,
                              Optional<Clock> clock) {
        this.sessionRepository = sessionRepository;
        this.userRepository = userRepository;
        this.rewardService = rewardService;
        this.clock = clock.orElse(Clock.systemUTC());
    }

    public record Student(long id, String loginIdentifier, String nickname) {

        static Student from(User user) {
            return new Student(user.getId(), user.getLoginIdentifier(), user.getNickname());
        }
    }

    /** {@code reward}: the day's non-cancelled study reward, or null. */
    public record DayRow(Student student, long totalSec, long timerSec, long manualSec, long sessionCount, RewardResponse reward) {
    }

    public record DayReview(LocalDate date, List<DayRow> students) {
    }

    public record SessionRow(long id, String subjectName, StudyMode mode, Instant startTime, Instant endTime,
                             int durationSec) {
    }

    public record StudentDay(Student student, LocalDate date, long totalSec, long timerSec, long manualSec,
                             List<SessionRow> sessions, RewardResponse reward) {
    }

    @Transactional(readOnly = true)
    public DayReview day(LocalDate requestedDate, AuthenticatedUser current) {
        rewardService.requireRewardManager(current);
        LocalDate date = requestedDate != null ? requestedDate : today();
        Map<Long, RewardResponse> rewards = rewardsByRecipient(date, current);
        List<DayRow> rows = sessionRepository.dayTotals(date).stream()
                .map(t -> {
                    long total = t.getTotalSec().longValue();
                    long manual = t.getManualSec().longValue();
                    return new DayRow(new Student(t.getUserId(), t.getLoginIdentifier(), t.getNickname()),
                            total, total - manual, manual, t.getSessionCount().longValue(), rewards.get(t.getUserId()));
                })
                .toList();
        return new DayReview(date, rows);
    }

    @Transactional(readOnly = true)
    public StudentDay student(long userId, LocalDate requestedDate, AuthenticatedUser current) {
        rewardService.requireRewardManager(current);
        LocalDate date = requestedDate != null ? requestedDate : today();
        User user = userRepository.findById(userId).orElseThrow(NotFoundException::new);
        List<StudySession> sessions = sessionRepository.findByUserIdAndRecordDateAndCompletedTrueOrderByIdAsc(userId, date);
        long total = sessions.stream().mapToLong(StudySession::getDurationSec).sum();
        long manual = sessions.stream().filter(s -> s.getMode() == StudyMode.MANUAL).mapToLong(StudySession::getDurationSec).sum();
        List<SessionRow> rows = sessions.stream()
                .map(s -> new SessionRow(s.getId(), s.getSubject().getName(), s.getMode(), s.getStartTime(), s.getEndTime(),
                        s.getDurationSec()))
                .toList();
        return new StudentDay(Student.from(user), date, total, total - manual, manual, rows, rewardsByRecipient(date, current).get(userId));
    }

    /**
     * Rewards the student's study on {@code request.date()}: the day must be over or today, and have recorded time.
     */
    @Transactional
    public RewardResponse reward(long userId, StudyRewardRequest request, AuthenticatedUser current) {
        rewardService.requireRewardManager(current);
        if (request.date().isAfter(today())) {
            throw new BadRequestException("INVALID_RECORD_DATE", "The day has not come yet");
        }
        long total = sessionRepository.findByUserIdAndRecordDateAndCompletedTrueOrderByIdAsc(userId, request.date()).stream()
                .mapToLong(StudySession::getDurationSec).sum();
        if (total <= 0) {
            throw new BadRequestException("NO_STUDY_TIME", "The student has no study time on that day");
        }
        return rewardService.createForStudy(userId, request.date(), (int) total, request.points(), request.reason(), current);
    }

    private Map<Long, RewardResponse> rewardsByRecipient(LocalDate date, AuthenticatedUser current) {
        return rewardService.studyRewards(date, current).stream()
                .collect(Collectors.toMap(r -> r.recipient().id(), Function.identity(), (a, b) -> a));
    }

    private LocalDate today() {
        return clock.instant().atZone(ZONE).toLocalDate();
    }
}
