# TASK-03 — Password/Auth Service

## Owner
Claude
## Reviewer
Gemini

## 목표
Spring Service 계층에서 안전한 password 검증과 인증 로직을 구현한다.

## 요구사항
- 검증된 Spring Security PasswordEncoder 사용
- Argon2id 계열
- 자체 암호 알고리즘 구현 금지
- password/passwordHash 로그 금지
- 사용자 존재 여부를 외부 오류 메시지로 구분하지 않음
- inactive 계정 로그인 거부

## Acceptance Criteria
- [x] PasswordEncoder 설정
- [x] Auth Service 구현
- [x] 정상 인증
- [x] 잘못된 password
- [x] 존재하지 않는 사용자
- [x] inactive 사용자
- [x] 민감정보 로그 없음
- [x] passwordHash 외부 노출 없음

## 구현 결과 (Claude)
- PasswordEncoder: `com.myproject.auth.config.PasswordEncoderConfig`
  - `DelegatingPasswordEncoder` + `Argon2PasswordEncoder` (Argon2id, m=19456 KiB, t=2, p=1, salt 16B, hash 32B)
  - 저장 형식: `{argon2}$argon2id$v=19$m=19456,t=2,p=1$...`
- Auth Service: `com.myproject.auth.service.AuthService#authenticate(loginIdentifier, rawPassword)`
  - 성공 시 `AuthenticatedUser`(id, loginIdentifier, roles) 반환 — password/hash 없음
  - 실패 시 항상 동일 메시지의 `AuthenticationFailedException`; `reason`은 내부 로그용
  - 존재하지 않는 사용자도 dummy hash로 검증 수행(응답 시간으로 계정 존재 여부 추정 방지)
  - password 검증 후 상태 확인 → password를 모르는 사람에게 INACTIVE 여부 비노출
  - 구 파라미터 hash는 로그인 성공 시 재인코딩
  - 로그에는 reason, userId만 기록 (password, hash, 입력된 loginIdentifier 미기록)
- 테스트: `PasswordEncoderConfigTest`, `AuthServiceTest`, `AuthServiceUserEnumerationTest` — 전체 `mvn test` 40건 통과
- 결정 사항은 `.ai/DECISIONS.md`의 D-005 ~ D-007 참고
