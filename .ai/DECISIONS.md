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
- 의존성: `bcprov-jdk18on` 1.78.1 (+ TASK-04에서 `spring-boot-starter-security`).

## D-006 인증 실패 응답 (TASK-03)
- 사용자 없음 / password 불일치 / INACTIVE / 입력 오류 모두 동일 메시지 `Invalid login identifier or password`.
- 실패 원인(`Reason`)은 서버 로그/감사용이며 외부 응답에 포함 금지 (TASK-04 API에서 준수 필요).
- INACTIVE 여부는 password가 맞을 때만 판정.
- raw password 최대 128자 (hash 연산 비용 제한).

## D-007 인증 로그 (TASK-03)
- 기록: 결과, reason, userId.
- 미기록: raw password, passwordHash, 사용자가 입력한 loginIdentifier (password 오입력 가능성).
- 로그인 시도 제한(rate limit)은 TASK-01 결정 후 TASK-04에서 적용 — **미결**.

## D-008 CSRF token 전달 방식 (TASK-04)
- token은 서버 session에 저장(`HttpSessionCsrfTokenRepository`)하고 `GET /api/auth/csrf` 응답 body로 전달.
- 이유: cookie 기반(`XSRF-TOKEN` cookie)은 운영에서 frontend/API가 다른 site가 되면 JS가 읽을 수 없음.
- React는 token을 **메모리에만** 보관하고 `X-XSRF-TOKEN` header로 전송 (storage 저장 금지).
- 로그인 성공 시 token 폐기 → 클라이언트는 `/api/auth/csrf` 재호출. `CSRF_INVALID`(403) 수신 시 재발급 후 1회 재시도 권장 (TASK-05).

## D-009 로그인 처리 방식 (TASK-04)
- Spring Security `formLogin` 대신 `AuthController`가 `AuthService` 호출 후 `SecurityContext`를 session에 저장.
- `ChangeSessionIdAuthenticationStrategy` + `CsrfAuthenticationStrategy`를 명시적으로 적용.
- session principal은 `AuthenticatedUser`(Serializable, password 없음). authority는 `ROLE_<Role>`.

## D-010 Session / Cookie (TASK-04, timeout은 잠정 — TASK-01 확정 필요)
- session timeout 30분, cookie tracking만 허용.
- SameSite=Lax: dev(localhost:3000 ↔ localhost:8080)는 same-site이므로 동작.
- 운영은 frontend·API를 같은 site(예: `app.example.com` / `api.example.com`)에 두는 것을 전제로 Lax 유지.
  서로 다른 site라면 SameSite=None 필요 → 보안 재검토 대상.
- 운영: `__Host-SESSION` + Secure, `forward-headers-strategy: native`(TLS 종료 proxy 전제).

## D-011 요청 body 파싱 오류 (TASK-04)
- Jackson 파싱 오류 메시지는 입력 원문(따옴표 없는 password 등)을 포함할 수 있으므로 로그·응답에 싣지 않음.
- `ApiExceptionHandler`가 400 `MALFORMED_REQUEST`만 반환.

## D-012 Frontend 스택 (TASK-05)
- `frontend/`: Vite + React 19 + TypeScript + react-router, 테스트는 Vitest + Testing Library(jsdom).
- dev server는 port 3000 고정(CORS 허용 origin과 일치).

## D-013 React 인증 정보 보관 (TASK-05)
- session: HttpOnly cookie만 사용, JS에서 접근/보관하지 않음.
- CSRF token: `src/api/client.ts` 모듈 메모리에만 보관. 새로고침 시 사라지며 다음 상태 변경 요청 때 재발급.
- 사용자 정보: React state(메모리)만. 새로고침 후 복원은 `/api/auth/me`로 (TASK-06).
- 금지 패턴은 `sourcePolicy.test.ts`로 CI에서 차단.

## D-014 `/api/auth/me` 조기 구현 (TASK-05)
- TASK-05 로그인 흐름(csrf → login → me)에 필요하여 backend `GET /api/auth/me`를 TASK-05에서 구현.

## D-015 권한 검증 위치 (TASK-06)
- 최종 권한 검증은 Spring Security URL 규칙(`SecurityConfig`). `/api/users/**` = `ROLE_ADMIN`, 그 외 `/api/**` = 인증 필요.
- React의 메뉴 숨김/`ProtectedRoute`는 UX 용도. 서버 403도 화면에서 별도 처리.

## D-016 AG Grid 데이터 경로 (TASK-06)
- infinite row model + 서버 정렬. `IDatasource`는 `gridDataService`가 만들고 `apiClient`만 사용.
- 코드 전체에서 `fetch` 직접 호출은 `api/client.ts`만 허용 (정적 테스트로 강제).
- AG Grid는 필요한 모듈만 등록. 컬럼 옵션 추가 시 `GridPage.test.tsx`가 누락 모듈을 console error로 잡아냄.

## D-017 세션 principal은 로그인 시점 스냅샷 (TASK-06, 검토 필요)
- 세션에 저장된 `AuthenticatedUser`(roles 포함)는 로그인 시점 값. 로그인 중인 사용자를 INACTIVE로 바꾸거나 role을 회수해도
  세션 만료/로그아웃 전까지 기존 권한이 유지됨.
- 대응안: (a) 요청마다 DB에서 상태/role 재확인하는 filter, (b) 관리자 조치 시 해당 사용자 세션 강제 만료(Spring Session 필요).
- **해결 (TASK-08 사전 점검, D-019)**: 대응안 (a) 적용.

## D-018 로그아웃 (TASK-07)
- Spring Security logout 필터 사용: `POST /api/auth/logout`, CSRF 필수, 204, session invalidate + cookie 삭제.
- 세션 없이 호출해도 204 (idempotent). React는 서버 확인(204/401) 후에만 로그아웃 상태로 전환.

## D-019 세션 사용자 재검증 (TASK-08 사전 점검, D-017 해결)
- `SessionUserRevalidationFilter`가 인증 요청마다 DB에서 사용자 재조회.
  삭제/INACTIVE → 세션 invalidate(401), role 변경 → 세션 authority 즉시 갱신.
- 비용: 인증 요청당 사용자 조회 1회.

## D-020 로그인 rate limit (TASK-08 사전 점검, 수치는 잠정 — TASK-01 확정 필요)
- 실패 횟수 기준, 15분 고정 window: identifier당 5회, client(remote address)당 50회 → 429 `TOO_MANY_ATTEMPTS` + `Retry-After`.
- 존재하지 않는 identifier도 동일하게 계산 (계정 존재 비노출). 차단 시 password hash 연산 없음. 성공 시 identifier 카운터 초기화.
- 메모리 저장 → 다중 인스턴스에서는 공유 저장소 필요. identifier 잠금은 lockout DoS 위험과 trade-off.
- 설정: `app.login-rate-limit.*`

## D-021 CORS 허용 method 축소 (TASK-08 사전 점검)
- 실제 제공하는 `GET`, `POST`만 허용. PUT/PATCH/DELETE API 추가 시 `SecurityConfig.corsConfigurationSource`에 함께 추가.

## D-022 Seed 사용자 / 프로필 (TASK-09)
- `SeedUsersRunner`: `app.seed.enabled=true`일 때만, `prod` 프로필에서는 절대 동작하지 않음 (테스트로 보장).
- `e2e` 프로필: E2E fixture 계정(비밀 아님, in-memory DB). `local` 프로필: 비밀번호는 환경변수 `LOCAL_USER_PASSWORD`, `LOCAL_ADMIN_PASSWORD`.
- 개발/테스트 DB는 datasource URL을 지정하지 않아 application context마다 고유한 H2 사용 (테스트 context 간 테이블 간섭 방지).

## D-023 테스트 계층 (TASK-09)
- backend: MockMvc + 실서버(RANDOM_PORT, 실 cookie) 테스트.
- frontend: Vitest(jsdom) + 소스 정책 정적 검사.
- E2E: Playwright + 설치된 Chrome, `:3000` → `:8080` 실제 cross-origin. CORS 거부 검증은 실제 loopback 서버(3001) 사용
  (page.route로 만든 origin은 Chrome Local Network Access가 먼저 막아 CORS 검증이 되지 않음).
- CI: `.github/workflows/ci.yml`.

## 미결 (TASK-01에서 결정 필요)
- rate limit 수치·잠금 정책 확정 (현재 D-020 잠정값), lockout DoS 대응
- 동시 로그인 정책, absolute session timeout
- 다중 서버 시 공유 session / rate limit 저장소 (Spring Session 등)
- 운영 Frontend/Backend Origin (SameSite 전제 확인)
- DB migration 도구 및 운영 DB
- frontend 배포 방식과 보안 header(CSP 등)
