# Decisions

## D-001 Spring 프로젝트 위치 및 스택 (TASK-02, Claude 제안)
- Spring API는 `backend/`에 둔다. React는 추후 `frontend/`를 권장한다.
- Spring Boot 3.3.2, Java 17, Maven, 개발용 H2 in-memory DB.
- 스키마는 현재 `ddl-auto: create-drop`(로컬 전용). 공유 환경 전에 Flyway 등 migration 도입 필요 — **미결**.

## D-002 loginIdentifier 정규화 (TASK-02, 잠정 — TASK-01 확정 필요)
- 저장·조회 시 `trim` + 소문자(`Locale.ROOT`)로 정규화하여 대소문자 무시 unique 보장.
- 최대 100자. DB unique constraint `uk_users_login_identifier`.
- 조회 호출자는 `User.normalizeLoginIdentifier()`를 거친 값을 전달해야 한다.

## D-003 User 상태 / Role (TASK-02, 잠정 — TASK-01 확정 필요)
- `UserStatus`: `ACTIVE`, `INACTIVE`. `User.canAuthenticate()`는 ACTIVE일 때만 true.
- `Role`: `USER`, `ADMIN`.

## D-004 passwordHash 보호 (TASK-02)
- Entity에는 인코딩된 `passwordHash`만 저장. 인코딩은 TASK-03의 PasswordEncoder 책임.
- `User.toString()`에서 제외, `@JsonIgnore` 적용, API는 `UserResponse`만 반환.
- `org.hibernate.orm.jdbc.bind` 로그 레벨 OFF 고정 (SQL 파라미터로 hash 노출 방지).

## D-005 PasswordEncoder (TASK-03)
- `DelegatingPasswordEncoder`(기본 id `argon2`) + `Argon2PasswordEncoder`.
- Argon2id 파라미터는 OWASP 최소 권장치: m=19 MiB, t=2, p=1, salt 16B, hash 32B.
- `{id}` prefix 없는 hash는 인증 실패 처리(`UNREADABLE_PASSWORD_HASH`). 레거시 hash 이관 시 prefix를 붙여야 함.
- 파라미터 상향 시 로그인 성공 사용자의 hash는 자동 재인코딩.
- 의존성: `spring-security-crypto`, `bcprov-jdk18on` 1.78.1. Security 필터 체인(`spring-boot-starter-security`)은 TASK-04에서 추가.

## D-006 인증 실패 응답 (TASK-03)
- 사용자 없음 / password 불일치 / INACTIVE / 입력 오류 모두 동일 메시지 `Invalid login identifier or password`.
- 실패 원인(`Reason`)은 서버 로그/감사용이며 외부 응답에 포함 금지 (TASK-04 API에서 준수 필요).
- INACTIVE 여부는 password가 맞을 때만 판정.
- raw password 최대 128자 (hash 연산 비용 제한).

## D-007 인증 로그 (TASK-03)
- 기록: 결과, reason, userId.
- 미기록: raw password, passwordHash, 사용자가 입력한 loginIdentifier (password 오입력 가능성).
- 로그인 시도 제한(rate limit)은 TASK-01 결정 후 TASK-04에서 적용 — **미결**.
