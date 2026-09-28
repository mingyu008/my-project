package com.myproject.schedule;

import com.myproject.auth.service.AuthenticatedUser;
import com.myproject.common.web.BadRequestException;
import com.myproject.common.web.ConflictException;
import com.myproject.common.web.ForbiddenException;
import com.myproject.common.web.NotFoundException;
import com.myproject.schedule.RewardDtos.RewardPage;
import com.myproject.schedule.RewardDtos.RewardRequest;
import com.myproject.schedule.RewardDtos.RewardResponse;
import com.myproject.schedule.RewardDtos.RewardSummary;
import com.myproject.schedule.RewardDtos.ScheduleRewards;
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
import java.util.List;

import static com.myproject.schedule.ScheduleAccess.isRewardManager;

/**
 * Rewards for completed schedules (DECISIONS D-035 ~ D-037).
 * <ul>
 *   <li>Reward managers (CONFIRMER or ADMIN) see and manage every reward; other users only see rewards they receive.</li>
 *   <li>A manager never adds, edits or pays a reward they receive themselves (another manager must).</li>
 * </ul>
 */
@Service
public class RewardService {

    public static final int MAX_PAGE_SIZE = 100;

    private static final Logger log = LoggerFactory.getLogger(RewardService.class);

    private final ScheduleRewardRepository rewardRepository;
    private final ScheduleService scheduleService;
    private final UserRepository userRepository;

    public RewardService(ScheduleRewardRepository rewardRepository, ScheduleService scheduleService, UserRepository userRepository) {
        this.rewardRepository = rewardRepository;
        this.scheduleService = scheduleService;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public ScheduleRewards forSchedule(long scheduleId, AuthenticatedUser current) {
        Schedule schedule = scheduleService.findVisible(scheduleId, current);
        List<ScheduleReward> rewards = isRewardManager(current)
                ? rewardRepository.findByScheduleIdOrderByIdAsc(scheduleId)
                : rewardRepository.findByScheduleIdAndRecipientIdOrderByIdAsc(scheduleId, current.id());
        return new ScheduleRewards(rewards.stream().map(r -> response(r, current)).toList(),
                isRewardManager(current) && schedule.getStatus() == ScheduleStatus.COMPLETED);
    }

    @Transactional
    public RewardResponse create(long scheduleId, RewardRequest request, AuthenticatedUser current) {
        requireManager(current, "create", null);
        Schedule schedule = scheduleService.findVisible(scheduleId, current);
        requireCompleted(schedule);
        User recipient = recipient(request.recipientId(), current);
        ScheduleReward reward = rewardRepository.save(
                ScheduleReward.create(schedule, recipient, request.points(), request.reason(), currentUser(current)));
        log.info("Reward created: rewardId={}, scheduleId={}, userId={}", reward.getId(), scheduleId, current.id());
        return response(reward, current);
    }

    @Transactional
    public RewardResponse update(long rewardId, RewardRequest request, AuthenticatedUser current) {
        requireManager(current, "update", rewardId);
        ScheduleReward reward = find(rewardId);
        requirePending(reward);
        requireNotOwn(reward, current);
        if (request.version() == null) {
            throw new BadRequestException("Invalid field: version");
        }
        if (request.version() != reward.getVersion()) {
            throw versionConflict();
        }
        // A study reward belongs to that student's day: points and reason may change, the recipient may not.
        if (reward.isStudy() && request.recipientId() != reward.getRecipient().getId().longValue()) {
            throw new BadRequestException("INVALID_RECIPIENT", "A study reward cannot move to another user");
        }
        reward.update(recipient(request.recipientId(), current), request.points(), request.reason(), currentUser(current));
        flush();
        log.info("Reward updated: rewardId={}, target={}, userId={}", rewardId, target(reward), current.id());
        return response(reward, current);
    }

    /**
     * Reward for one day of a student's study (TASK-TIMER-02). The caller has checked that the student studied
     * that day; {@code studySec} is kept as a snapshot. At most one non-cancelled study reward per student and day.
     */
    @Transactional
    public RewardResponse createForStudy(long recipientId, LocalDate date, int studySec, int points, String reason,
                                         AuthenticatedUser current) {
        requireRewardManager(current);
        User recipient = recipient(recipientId, current);
        if (rewardRepository.existsByRecipientIdAndStudyDateAndStatusNot(recipientId, date, RewardStatus.CANCELLED)) {
            throw new ConflictException("STUDY_REWARD_EXISTS", "This study day already has a reward");
        }
        ScheduleReward reward = rewardRepository.save(
                ScheduleReward.createForStudy(recipient, date, studySec, points, reason, currentUser(current)));
        log.info("Reward created: rewardId={}, target={}, userId={}", reward.getId(), target(reward), current.id());
        return response(reward, current);
    }

    /** Non-cancelled study rewards of one day, for the study review screen (managers only). */
    @Transactional(readOnly = true)
    public List<RewardResponse> studyRewards(LocalDate date, AuthenticatedUser current) {
        requireRewardManager(current);
        return rewardRepository.findByStudyDateAndStatusNotOrderByIdAsc(date, RewardStatus.CANCELLED).stream()
                .map(r -> response(r, current))
                .toList();
    }

    /** CONFIRMER or ADMIN, otherwise 403. Also guards the study review screen. */
    public void requireRewardManager(AuthenticatedUser current) {
        requireManager(current, "study-review", null);
    }

    @Transactional
    public RewardResponse pay(long rewardId, AuthenticatedUser current) {
        requireManager(current, "pay", rewardId);
        ScheduleReward reward = find(rewardId);
        requirePending(reward);
        requireNotOwn(reward, current);
        if (!reward.isStudy()) {
            Schedule schedule = reward.getSchedule();
            if (schedule.isDeleted()) {
                throw notCompleted();
            }
            requireCompleted(schedule);
        }
        reward.pay(currentUser(current));
        flush();
        log.info("Reward paid: rewardId={}, target={}, userId={}", rewardId, target(reward), current.id());
        return response(reward, current);
    }

    /** Cancelling is allowed on one's own reward too (it only gives up points). */
    @Transactional
    public RewardResponse cancel(long rewardId, AuthenticatedUser current) {
        requireManager(current, "cancel", rewardId);
        ScheduleReward reward = find(rewardId);
        requirePending(reward);
        reward.cancel(currentUser(current));
        flush();
        log.info("Reward cancelled: rewardId={}, target={}, userId={}", rewardId, target(reward), current.id());
        return response(reward, current);
    }

    /** Newest first. Non-managers always get only their own rewards, whatever {@code recipientId} says. */
    @Transactional(readOnly = true)
    public RewardPage list(RewardStatus status, Long recipientId, int page, int size, AuthenticatedUser current) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BadRequestException("page must be >= 0 and size between 1 and " + MAX_PAGE_SIZE);
        }
        Long recipient = isRewardManager(current) ? recipientId : current.id();
        Specification<ScheduleReward> spec = (root, query, cb) -> cb.conjunction();
        if (status != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("status"), status));
        }
        if (recipient != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("recipient").get("id"), recipient));
        }
        Page<ScheduleReward> result = rewardRepository.findAll(spec, PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "id")));
        return new RewardPage(result.map(r -> response(r, current)).getContent(), page, size,
                result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    public List<RewardSummary> summary(AuthenticatedUser current) {
        return rewardRepository.summarize(isRewardManager(current) ? null : current.id()).stream()
                .map(t -> new RewardSummary(new UserRef(t.getRecipientId(), t.getLoginIdentifier()),
                        t.getPendingPoints().longValue(), t.getPaidPoints().longValue(), t.getPaidCount().longValue()))
                .toList();
    }

    private RewardResponse response(ScheduleReward reward, AuthenticatedUser current) {
        return RewardResponse.from(reward, isRewardManager(current) && reward.isPending() && !reward.isFor(current.id()));
    }

    /** For logs: "schedule:12" or "study:2026-09-28". */
    private static String target(ScheduleReward reward) {
        return reward.isStudy() ? "study:" + reward.getStudyDate() : "schedule:" + reward.getSchedule().getId();
    }

    private ScheduleReward find(long rewardId) {
        return rewardRepository.findWithDetailsById(rewardId).orElseThrow(NotFoundException::new);
    }

    private User recipient(long recipientId, AuthenticatedUser current) {
        if (recipientId == current.id()) {
            throw selfReward();
        }
        return userRepository.findById(recipientId)
                .filter(user -> user.getStatus() == UserStatus.ACTIVE)
                .orElseThrow(() -> new BadRequestException("INVALID_RECIPIENT", "Recipient not found"));
    }

    private User currentUser(AuthenticatedUser current) {
        return userRepository.findById(current.id()).orElseThrow(NotFoundException::new);
    }

    private void flush() {
        try {
            rewardRepository.flush();
        } catch (ObjectOptimisticLockingFailureException e) {
            throw versionConflict();
        }
    }

    private static void requireManager(AuthenticatedUser current, String action, Long rewardId) {
        if (!isRewardManager(current)) {
            log.info("Reward {} denied: rewardId={}, userId={}", action, rewardId, current.id());
            throw new ForbiddenException();
        }
    }

    private static void requireCompleted(Schedule schedule) {
        if (schedule.getStatus() != ScheduleStatus.COMPLETED) {
            throw notCompleted();
        }
    }

    private static void requirePending(ScheduleReward reward) {
        if (!reward.isPending()) {
            throw new ConflictException("REWARD_NOT_PENDING", "Only pending rewards can be changed");
        }
    }

    private static void requireNotOwn(ScheduleReward reward, AuthenticatedUser current) {
        if (reward.isFor(current.id())) {
            throw selfReward();
        }
    }

    private static ConflictException notCompleted() {
        return new ConflictException("SCHEDULE_NOT_COMPLETED", "Rewards need a completed schedule");
    }

    private static BadRequestException selfReward() {
        return new BadRequestException("SELF_REWARD_NOT_ALLOWED", "A reward manager cannot handle their own reward");
    }

    private static ConflictException versionConflict() {
        return new ConflictException("REWARD_VERSION_CONFLICT", "The reward was changed by someone else");
    }
}
