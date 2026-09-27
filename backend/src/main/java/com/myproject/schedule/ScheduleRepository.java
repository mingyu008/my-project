package com.myproject.schedule;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;

/**
 * Soft-deleted rows are still in the table: use {@link ScheduleSpecifications#notDeleted()} or the
 * {@code ...AndDeletedFalse} methods for every read.
 */
public interface ScheduleRepository extends JpaRepository<Schedule, Long>, JpaSpecificationExecutor<Schedule> {

    @Override
    @EntityGraph(attributePaths = {"assignee", "createdBy", "updatedBy"})
    Page<Schedule> findAll(Specification<Schedule> spec, Pageable pageable);

    @EntityGraph(attributePaths = {"assignee", "createdBy", "updatedBy"})
    Optional<Schedule> findWithUsersByIdAndDeletedFalse(Long id);
}
