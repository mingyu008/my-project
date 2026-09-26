# TASK-02 — User Domain 및 Repository

## Owner
Claude
## Reviewer
Gemini

## 목표
Spring에서 인증에 필요한 User Domain과 Repository를 구현한다.

## User 예시
```text
id
loginIdentifier
passwordHash
status
roles
createdAt
updatedAt
```

## 보안 요구사항
- 평문 password 저장 금지
- passwordHash만 저장
- passwordHash API 노출 금지
- password/passwordHash 로그 금지
- loginIdentifier unique
- INACTIVE 사용자는 인증 거부
- Entity를 그대로 API Response로 반환하지 않음

## Acceptance Criteria
- [x] Entity/Domain
- [x] Repository
- [x] unique login identifier
- [x] passwordHash 저장
- [x] passwordHash Response 노출 없음
- [x] 정상 사용자 조회 테스트
- [x] 존재하지 않는 사용자 테스트
- [x] inactive 사용자 테스트
- [x] 민감정보 로그 테스트

## 구현 결과 (Claude)
- 위치: `backend/` (Spring Boot 3.3.2, Java 17, Maven)
- Entity: `com.myproject.user.domain.User` (`users` 테이블, `user_roles` 컬렉션 테이블)
- Repository: `com.myproject.user.repository.UserRepository`
- Response DTO: `com.myproject.user.dto.UserResponse` (passwordHash 필드 없음)
- 테스트: `UserDomainTest`, `UserRepositoryTest`, `UserSensitiveDataTest` — `mvn test` 20건 통과
- 결정 사항은 `.ai/DECISIONS.md`의 D-001 ~ D-004 참고
