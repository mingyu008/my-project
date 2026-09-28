package com.myproject.study;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SubjectRepository extends JpaRepository<Subject, Long> {

    List<Subject> findByUserIdOrderBySortOrderAscIdAsc(long userId);

    Optional<Subject> findByIdAndUserId(long id, long userId);

    boolean existsByUserIdAndName(long userId, String name);

    long countByUserId(long userId);
}
