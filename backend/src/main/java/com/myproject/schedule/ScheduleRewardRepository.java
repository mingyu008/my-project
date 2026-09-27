package com.myproject.schedule;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ScheduleRewardRepository extends JpaRepository<ScheduleReward, Long>, JpaSpecificationExecutor<ScheduleReward> {

    @Override
    @EntityGraph(attributePaths = {"schedule", "recipient", "createdBy", "updatedBy"})
    Page<ScheduleReward> findAll(Specification<ScheduleReward> spec, Pageable pageable);

    @EntityGraph(attributePaths = {"schedule", "recipient", "createdBy", "updatedBy"})
    Optional<ScheduleReward> findWithDetailsById(Long id);

    @EntityGraph(attributePaths = {"schedule", "recipient", "createdBy", "updatedBy"})
    List<ScheduleReward> findByScheduleIdOrderByIdAsc(Long scheduleId);

    @EntityGraph(attributePaths = {"schedule", "recipient", "createdBy", "updatedBy"})
    List<ScheduleReward> findByScheduleIdAndRecipientIdOrderByIdAsc(Long scheduleId, Long recipientId);

    /** Per-recipient totals; cancelled rewards are not counted. {@code recipientId} null means everyone. */
    @Query("""
            select r.recipient.id as recipientId,
                   r.recipient.loginIdentifier as loginIdentifier,
                   sum(case when r.status = com.myproject.schedule.RewardStatus.PENDING then r.points else 0 end) as pendingPoints,
                   sum(case when r.status = com.myproject.schedule.RewardStatus.PAID then r.points else 0 end) as paidPoints,
                   sum(case when r.status = com.myproject.schedule.RewardStatus.PAID then 1 else 0 end) as paidCount
            from ScheduleReward r
            where r.status <> com.myproject.schedule.RewardStatus.CANCELLED
              and (:recipientId is null or r.recipient.id = :recipientId)
            group by r.recipient.id, r.recipient.loginIdentifier
            order by r.recipient.loginIdentifier
            """)
    List<RecipientTotals> summarize(@Param("recipientId") Long recipientId);

    interface RecipientTotals {
        Long getRecipientId();

        String getLoginIdentifier();

        Number getPendingPoints();

        Number getPaidPoints();

        Number getPaidCount();
    }
}
