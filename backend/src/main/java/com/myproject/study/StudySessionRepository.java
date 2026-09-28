package com.myproject.study;

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
}
