package com.myproject.study;

import com.myproject.auth.service.AuthenticatedUser;
import com.myproject.common.web.BadRequestException;
import com.myproject.common.web.ConflictException;
import com.myproject.common.web.NotFoundException;
import com.myproject.study.StudyDtos.ManualRequest;
import com.myproject.study.StudyDtos.SessionResponse;
import com.myproject.study.StudyDtos.StartRequest;
import com.myproject.study.StudyDtos.StopRequest;
import com.myproject.study.StudyDtos.SubjectResponse;
import com.myproject.study.StudyDtos.SubjectTotal;
import com.myproject.study.StudyDtos.Summary;
import com.myproject.user.domain.User;
import com.myproject.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Study timer rules (TASK-TIMER-01). Every operation works on the current user's own data only; other users'
 * subjects and sessions are reported as 404.
 * <ul>
 *   <li>At most one open timer session per user; it lives on the server, so a refresh or another device can resume it.</li>
 *   <li>Durations are computed from server timestamps. The client only says when stop was pressed.</li>
 *   <li>Stopping an already stopped session returns it unchanged (retries never record twice).</li>
 * </ul>
 */
@Service
public class StudyService {

    /** Service time zone for "today" (DECISIONS D-030). */
    public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    public static final List<String> DEFAULT_SUBJECTS = List.of("수학", "영어", "국어", "탐구", "기타");
    public static final int MAX_SUBJECTS = 20;
    public static final int MIN_MANUAL_SEC = 60;
    public static final int MIN_PLANNED_SEC = 60;
    public static final int MAX_PLANNED_SEC = 4 * 60 * 60;
    /** How far back time can be added by hand. */
    public static final int MANUAL_MAX_DAYS_BACK = 30;
    /** Tolerated client clock lead for manual end times. */
    private static final Duration CLOCK_SKEW = Duration.ofMinutes(1);

    private static final Logger log = LoggerFactory.getLogger(StudyService.class);

    private final SubjectRepository subjectRepository;
    private final StudySessionRepository sessionRepository;
    private final StudyGoalRepository goalRepository;
    private final UserRepository userRepository;
    private final TransactionTemplate newTransaction;
    private final Clock clock;

    public StudyService(SubjectRepository subjectRepository, StudySessionRepository sessionRepository,
                        StudyGoalRepository goalRepository, UserRepository userRepository,
                        PlatformTransactionManager transactionManager, Optional<Clock> clock) {
        this.subjectRepository = subjectRepository;
        this.sessionRepository = sessionRepository;
        this.goalRepository = goalRepository;
        this.userRepository = userRepository;
        this.newTransaction = new TransactionTemplate(transactionManager);
        this.newTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.clock = clock.orElse(Clock.systemUTC());
    }

    // ---------- Subjects ----------

    /**
     * The first call creates the default subjects. Two concurrent first calls (e.g. React StrictMode) may race;
     * the loser's insert hits the unique constraint and simply reads the winner's rows.
     */
    public List<SubjectResponse> subjects(AuthenticatedUser current) {
        List<Subject> subjects = subjectRepository.findByUserIdOrderBySortOrderAscIdAsc(current.id());
        if (subjects.isEmpty()) {
            try {
                newTransaction.executeWithoutResult(status -> {
                    User user = userRepository.getReferenceById(current.id());
                    for (int i = 0; i < DEFAULT_SUBJECTS.size(); i++) {
                        subjectRepository.saveAndFlush(Subject.create(user, DEFAULT_SUBJECTS.get(i), i));
                    }
                });
            } catch (DataIntegrityViolationException e) {
                log.debug("Default subjects created concurrently: userId={}", current.id());
            }
            subjects = subjectRepository.findByUserIdOrderBySortOrderAscIdAsc(current.id());
        }
        return subjects.stream().map(SubjectResponse::from).toList();
    }

    @Transactional
    public SubjectResponse addSubject(String requestedName, AuthenticatedUser current) {
        String name;
        try {
            name = Subject.normalizeName(requestedName);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("INVALID_SUBJECT_NAME", "Subject name must be 1 to " + Subject.NAME_MAX_LENGTH + " characters");
        }
        long count = subjectRepository.countByUserId(current.id());
        if (count >= MAX_SUBJECTS) {
            throw new BadRequestException("TOO_MANY_SUBJECTS", "At most " + MAX_SUBJECTS + " subjects");
        }
        if (subjectRepository.existsByUserIdAndName(current.id(), name)) {
            throw nameTaken();
        }
        try {
            Subject subject = subjectRepository.saveAndFlush(
                    Subject.create(userRepository.getReferenceById(current.id()), name, (int) count));
            return SubjectResponse.from(subject);
        } catch (DataIntegrityViolationException e) {
            throw nameTaken();
        }
    }

    private static ConflictException nameTaken() {
        return new ConflictException("SUBJECT_NAME_TAKEN", "Subject name is already in use");
    }

    // ---------- Summary / goal ----------

    @Transactional(readOnly = true)
    public Summary summary(LocalDate requestedDate, AuthenticatedUser current) {
        LocalDate date = requestedDate != null ? requestedDate : today();
        Map<Long, Long> totals = new HashMap<>();
        for (Object[] row : sessionRepository.sumBySubject(current.id(), date)) {
            totals.put(((Number) row[0]).longValue(), ((Number) row[1]).longValue());
        }
        List<SubjectTotal> subjects = subjectRepository.findByUserIdOrderBySortOrderAscIdAsc(current.id()).stream()
                .map(s -> new SubjectTotal(s.getId(), s.getName(), totals.getOrDefault(s.getId(), 0L)))
                .toList();
        long total = totals.values().stream().mapToLong(Long::longValue).sum();
        return new Summary(date, total, goalSeconds(current.id()), subjects);
    }

    @Transactional
    public int setGoal(Integer seconds, AuthenticatedUser current) {
        if (seconds == null || seconds < StudyGoal.MIN_SECONDS || seconds > StudyGoal.MAX_SECONDS) {
            throw new BadRequestException("INVALID_GOAL", "Daily goal must be 10 minutes to 24 hours");
        }
        StudyGoal goal = goalRepository.findById(current.id()).orElseGet(() -> new StudyGoal(current.id(), seconds));
        goal.change(seconds);
        goalRepository.save(goal);
        return seconds;
    }

    private int goalSeconds(long userId) {
        return goalRepository.findById(userId).map(StudyGoal::getDailyGoalSec).orElse(StudyGoal.DEFAULT_SECONDS);
    }

    // ---------- Timer sessions ----------

    @Transactional(readOnly = true)
    public Optional<SessionResponse> active(AuthenticatedUser current) {
        return sessionRepository.findFirstByUserIdAndCompletedFalseOrderByIdDesc(current.id()).map(this::response);
    }

    @Transactional
    public SessionResponse start(StartRequest request, AuthenticatedUser current) {
        if (request.mode() == null || !request.mode().isTimer()) {
            throw new BadRequestException("INVALID_MODE", "Mode must be STOPWATCH or POMODORO_FOCUS");
        }
        Integer planned = request.plannedSec();
        if (request.mode() == StudyMode.POMODORO_FOCUS
                && (planned == null || planned < MIN_PLANNED_SEC || planned > MAX_PLANNED_SEC)) {
            throw new BadRequestException("INVALID_PLANNED_TIME", "Focus length must be 1 minute to 4 hours");
        }
        Subject subject = ownSubject(request.subjectId(), current);
        if (sessionRepository.findFirstByUserIdAndCompletedFalseOrderByIdDesc(current.id()).isPresent()) {
            throw new ConflictException("ACTIVE_SESSION_EXISTS", "Another study session is in progress");
        }
        Instant now = clock.instant();
        StudySession session = sessionRepository.save(StudySession.start(
                userRepository.getReferenceById(current.id()), subject, request.mode(), planned, now, now.atZone(ZONE).toLocalDate()));
        log.info("Study session started: userId={}, sessionId={}, mode={}", current.id(), session.getId(), request.mode());
        return response(session);
    }

    @Transactional
    public SessionResponse pause(long sessionId, AuthenticatedUser current) {
        StudySession session = ownActiveSession(sessionId, current);
        session.pause(clock.instant());
        return response(session);
    }

    @Transactional
    public SessionResponse resume(long sessionId, AuthenticatedUser current) {
        StudySession session = ownActiveSession(sessionId, current);
        session.resume(clock.instant());
        return response(session);
    }

    /**
     * Idempotent: a stopped session is returned as is, so a retried (queued) request never records twice.
     */
    @Transactional
    public SessionResponse stop(long sessionId, StopRequest request, AuthenticatedUser current) {
        StudySession session = ownSession(sessionId, current);
        if (session.isCompleted()) {
            return response(session);
        }
        Instant now = clock.instant();
        Instant end = request == null || request.endTime() == null ? now : request.endTime();
        if (end.isAfter(now)) {
            end = now;
        }
        if (end.isBefore(session.getStartTime())) {
            end = session.getStartTime();
        }
        session.stop(end);
        log.info("Study session stopped: userId={}, sessionId={}, durationSec={}", current.id(), sessionId, session.getDurationSec());
        return response(session);
    }

    /**
     * Throws away an open session without recording it ("저장하지 않고 종료"). Completed records are kept.
     */
    @Transactional
    public void discard(long sessionId, AuthenticatedUser current) {
        StudySession session = ownSession(sessionId, current);
        if (session.isCompleted()) {
            throw new ConflictException("SESSION_COMPLETED", "A completed session cannot be discarded");
        }
        sessionRepository.delete(session);
        log.info("Study session discarded: userId={}, sessionId={}", current.id(), sessionId);
    }

    // ---------- Manual ----------

    @Transactional
    public SessionResponse manual(ManualRequest request, AuthenticatedUser current) {
        Subject subject = ownSubject(request.subjectId(), current);
        Instant now = clock.instant();
        LocalDate today = now.atZone(ZONE).toLocalDate();

        int seconds;
        LocalDate date = request.recordDate();
        Instant start = request.startTime();
        Instant end = request.endTime();
        if (start != null || end != null) {
            if (start == null || end == null || !end.isAfter(start) || end.isAfter(now.plus(CLOCK_SKEW))
                    || Duration.between(start, end).getSeconds() > StudySession.MAX_SECONDS) {
                throw new BadRequestException("INVALID_PERIOD", "End must be after start, not in the future, and within 24 hours");
            }
            seconds = (int) Duration.between(start, end).getSeconds();
            if (date == null) {
                date = start.atZone(ZONE).toLocalDate();
            }
        } else {
            Integer requested = request.durationSec();
            if (requested == null || requested < MIN_MANUAL_SEC || requested > StudySession.MAX_SECONDS) {
                throw new BadRequestException("INVALID_DURATION", "Duration must be 1 minute to 24 hours");
            }
            seconds = requested;
        }
        if (seconds < MIN_MANUAL_SEC) {
            throw new BadRequestException("INVALID_DURATION", "Duration must be 1 minute to 24 hours");
        }
        if (date == null) {
            date = today;
        }
        if (date.isAfter(today) || date.isBefore(today.minusDays(MANUAL_MAX_DAYS_BACK))) {
            throw new BadRequestException("INVALID_RECORD_DATE", "Date must be within the last " + MANUAL_MAX_DAYS_BACK + " days");
        }
        long dayTotal = sessionRepository.sumBySubject(current.id(), date).stream()
                .mapToLong(row -> ((Number) row[1]).longValue()).sum();
        if (dayTotal + seconds > StudySession.MAX_SECONDS) {
            throw new BadRequestException("DAILY_LIMIT_EXCEEDED", "A day cannot have more than 24 hours of study");
        }

        StudySession session = sessionRepository.save(StudySession.manual(
                userRepository.getReferenceById(current.id()), subject, date, seconds, start, end));
        log.info("Study time added: userId={}, sessionId={}, durationSec={}", current.id(), session.getId(), seconds);
        return response(session);
    }

    // ---------- Helpers ----------

    private LocalDate today() {
        return clock.instant().atZone(ZONE).toLocalDate();
    }

    private Subject ownSubject(Long subjectId, AuthenticatedUser current) {
        if (subjectId == null) {
            throw new BadRequestException("INVALID_SUBJECT", "Subject is required");
        }
        return subjectRepository.findByIdAndUserId(subjectId, current.id()).orElseThrow(NotFoundException::new);
    }

    private StudySession ownSession(long sessionId, AuthenticatedUser current) {
        return sessionRepository.findByIdAndUserId(sessionId, current.id()).orElseThrow(NotFoundException::new);
    }

    private StudySession ownActiveSession(long sessionId, AuthenticatedUser current) {
        StudySession session = ownSession(sessionId, current);
        if (session.isCompleted()) {
            throw new ConflictException("SESSION_COMPLETED", "The session has already ended");
        }
        return session;
    }

    private SessionResponse response(StudySession session) {
        return SessionResponse.from(session, clock.instant());
    }
}
