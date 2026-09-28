package com.myproject.study;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface StudySessionRepository extends JpaRepository<StudySession, Long> {

    Optional<StudySession> findByIdAndUserId(long id, long userId);

    Optional<StudySession> findFirstByUserIdAndCompletedFalseOrderByIdDesc(long userId);

    /** Rows of [subjectId, sum(durationSec)] for the completed sessions of one day. */
    @Query("select s.subject.id, sum(s.durationSec) from StudySession s "
            + "where s.user.id = :userId and s.recordDate = :date and s.completed = true group by s.subject.id")
    List<Object[]> sumBySubject(@Param("userId") long userId, @Param("date") LocalDate date);

    /** Every user's completed study time on one day, most first (study review, TASK-TIMER-02). */
    @Query("""
            select s.user.id as userId,
                   s.user.loginIdentifier as loginIdentifier,
                   s.user.nickname as nickname,
                   sum(s.durationSec) as totalSec,
                   sum(case when s.mode = com.myproject.study.StudyMode.MANUAL then s.durationSec else 0 end) as manualSec,
                   count(s) as sessionCount
            from StudySession s
            where s.recordDate = :date and s.completed = true
            group by s.user.id, s.user.loginIdentifier, s.user.nickname
            order by sum(s.durationSec) desc, s.user.loginIdentifier
            """)
    List<DayTotals> dayTotals(@Param("date") LocalDate date);

    @EntityGraph(attributePaths = "subject")
    List<StudySession> findByUserIdAndRecordDateAndCompletedTrueOrderByIdAsc(long userId, LocalDate date);

    interface DayTotals {
        Long getUserId();

        String getLoginIdentifier();

        String getNickname();

        Number getTotalSec();

        Number getManualSec();

        Number getSessionCount();
    }
}
