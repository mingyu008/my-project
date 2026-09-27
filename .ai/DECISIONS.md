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

## D-024 회원 가입 = 관리자 승인제 (TASK-10, Human 결정)
- 가입 계정은 `PENDING` + role USER. ADMIN 승인 시 ACTIVE, 거절 시 신청 삭제(아이디 재사용 가능).
- PENDING 로그인 실패 응답은 다른 실패와 동일 (D-006 유지). 가입 완료 화면에서 승인 대기임을 안내.

## D-025 가입 입력 규칙 (TASK-10)
- 아이디: 정규화 후 `[a-z0-9._-]{4,30}` (기존 계정·seed에는 적용하지 않음, 로그인은 기존 규칙).
- 비밀번호: 12~128자, 단일 문자 반복 금지, 아이디 포함 금지 (NIST SP 800-63B 방식: 조합 규칙 대신 길이).
  유출 비밀번호 목록 검사는 미적용 — 필요 시 추가.
- 아이디 중복은 409로 알림 (아이디 기반 가입에서는 불가피한 존재 여부 노출). 가입 rate limit(client당 1시간 10회)으로 탐색 제한.

## D-026 게시판 권한 (TASK-11, 범위: 글 CRUD + 페이징 — Human 결정)
- 로그인 사용자 전원 조회·작성. 수정·삭제는 작성자 또는 ADMIN (서버 `PostService`에서 검증, UI 버튼은 `editable` 힌트).
- 본문은 plain text. 프론트는 text로만 렌더링하고 raw HTML API 사용을 정적 테스트로 금지.
- 목록 size 상한 50, 최신순.

## D-027 CORS 허용 method 갱신 (TASK-11, D-021 대체)
- 게시판 수정/삭제를 위해 `GET, POST, PUT, DELETE` 허용. PATCH는 미사용이라 계속 거부.

## D-028 공통 rate limit 카운터 (TASK-10)
- `FixedWindowCounter`(메모리)를 로그인·가입 limiter가 공유. 다중 인스턴스에서는 공유 저장소 필요 (기존 미결과 동일).

## D-029 일정 조회 범위 / 권한 (TASK-12, Claude 제안 — 명세 01·05 보완)
- ADMIN: 전체. USER: 본인이 등록 + 본인이 담당자 + 공개(`isPublic`) 일정만 조회.
- 수정·삭제: 등록자 또는 ADMIN (담당자는 읽기만). 서버 `ScheduleService`에서 검증.
- 볼 수 없는 일정은 404 (존재 여부 비노출), 볼 수 있지만 수정 권한이 없으면 403.
- 명세의 "읽기 사용자" 역할은 기존 Role(USER/ADMIN)에 없어 미구현 — 필요 시 Role 추가 후 수정·등록 차단.

## D-030 일정 시간대 (TASK-12)
- `startAt`/`endAt`은 zone 없는 `LocalDateTime`(ISO-8601, 예 `2026-09-28T10:00:00`)으로 서비스 기준 시간대 Asia/Seoul의 벽시계 시각으로 해석.
- 감사 시각 `createdAt`/`updatedAt`은 기존과 같이 UTC `Instant`.
- 시작=종료 허용(MVP), 종료<시작은 400 `INVALID_SCHEDULE_PERIOD`.

## D-031 일정 중복 판정 (TASK-12)
- 같은 담당자, `existing.start < new.end AND existing.end > new.start`, 삭제·취소(CANCELLED) 일정 제외, 수정 시 자기 자신 제외.
- 경고만 하고 저장은 막지 않음(명세 FR-09 기본 정책). UI는 저장 전 확인 → 경고 → "그래도 저장".
- 응답은 볼 수 있는 일정만 `items`로, 볼 수 없는 일정은 `hiddenCount`로만 알림 (담당자의 busy 여부는 노출됨 — 일정 공유 서비스 특성상 수용).

## D-032 일정 상태 전이 / 동시성 (TASK-12)
- 전이: PLANNED→IN_PROGRESS·CANCELLED, IN_PROGRESS→COMPLETED·CANCELLED, 같은 상태 유지는 허용. ADMIN은 강제 변경 가능. 등록 시에는 모든 상태 허용.
- `version` 컬럼 optimistic lock. PUT은 `version` 필수, 불일치·동시 수정은 409 `SCHEDULE_VERSION_CONFLICT`.

## D-033 일정 논리 삭제 / 담당자 (TASK-12)
- 삭제는 `deleted=true`(수정자 기록). `@SQLRestriction` 대신 모든 조회에서 명시적으로 제외 (행이 남아 사용자 FK가 유지됨).
- 담당자는 ACTIVE 사용자만 지정 가능. 담당자 목록 `GET /api/schedules/assignees`는 로그인 사용자 전원에게 ACTIVE 사용자의 id·아이디를 노출.

## D-034 일정 API 에러 형식 (TASK-12)
- 명세 04의 `fieldErrors`/`timestamp` 형식 대신 기존 공통 `ErrorResponse{code, message}` 유지 (공통 컴포넌트 변경 금지 원칙).
  일정 전용 code: `INVALID_SCHEDULE_PERIOD`, `INVALID_ASSIGNEE`, `INVALID_STATUS_TRANSITION`, `SCHEDULE_VERSION_CONFLICT`.

## D-035 확인자 권한 CONFIRMER (TASK-13, Human 결정)
- 새 Role `CONFIRMER`. ADMIN이 `PUT/DELETE /api/users/{id}/roles/confirmer`로 부여·회수(ACTIVE 사용자만, ADMIN 행에는 UI 미표시).
- 보상 관리자 = CONFIRMER 또는 ADMIN. 역할 변경은 D-019 필터로 기존 세션에 다음 요청부터 반영.
- **D-029 보완**: CONFIRMER는 완료 확인을 위해 모든 일정을 조회할 수 있다. 일정 수정·삭제 권한은 없음(등록자·ADMIN 유지).

## D-036 보상 규칙 (TASK-13, Human 결정 + Claude 보완)
- 포인트(1~100,000) + 사유(1~500자, plain text). 완료(COMPLETED)되고 삭제되지 않은 일정에만 추가.
- 상태: PENDING → PAID(지급 시에도 일정이 완료 상태여야 함) 또는 CANCELLED. PAID/CANCELLED는 최종(수정·회수 불가 — 회수는 후속 후보).
- 이해충돌: 관리자는 본인이 수령자인 보상을 추가·수정·지급할 수 없음(400 `SELF_REWARD_NOT_ALLOWED`). 취소는 허용.
- 수정은 `version` optimistic lock(409 `REWARD_VERSION_CONFLICT`). 일정이 삭제·재오픈돼도 보상은 이력으로 남고 지급만 막힘.

## D-037 보상 조회 범위 (TASK-13)
- 관리자: 모든 보상·전체 수령자 집계. 일반 사용자: 본인이 수령자인 보상과 본인 집계만(`recipientId` 파라미터는 무시).
- 일정별 보상은 그 일정을 볼 수 있어야 조회 가능(안 보이면 404). 보상 변경 API는 비관리자에게 항상 403.
- 집계는 취소 제외: 지급 대기 합계, 지급 완료 합계, 지급 완료 건수.

## D-038 일정 달력 (TASK-13)
- `GET /api/schedules/calendar`: 기간 최대 62일(6주 월간 격자 포함), 최대 500건 + `truncated`. 목록과 같은 가시성 규칙.
- 프론트는 달력 라이브러리 없이 구현(번들·CSP 미결). 일요일 시작, 날짜 계산은 `yyyy-MM-dd` 문자열을 UTC 자정으로만 다뤄 브라우저 시간대 영향 없음.
- 00:00에 끝나는 일정은 다음 날에 표시하지 않음. 상태는 텍스트로도 제공(색만으로 구분하지 않음).

## D-039 반응형 기준 (TASK-14)
- 구간: 휴대폰 ≤699px, 태블릿 ≤999px, 그 이상 데스크톱. JS 분기는 `layout/useMediaQuery.ts`(matchMedia, 미지원 환경은 데스크톱), CSS `@media`와 값 일치.
- 휴대폰: 일정 목록은 AG Grid 대신 서버 페이징 카드, 월간 달력은 날짜 탭 + 아래 일정 목록, 표(`table.responsive` + `data-label`)는 행별 카드, 입력 글꼴 16px(iOS 확대 방지).
- 로그인 후 모든 화면에 공통 헤더(홈 링크 + 접힌 메뉴). 메뉴 항목은 `layout/navItems.ts`로 홈 화면과 공유.
- AG Grid는 OS 다크 모드를 따름(themeQuartz + colorSchemeDarkBlue).

## D-040 무료 배포: Render + PostgreSQL(Supabase, D-044), 한 주소 (TASK-15, Human 결정)
- Render Free(Docker, Singapore) 1개 서비스가 API와 React 빌드를 함께 제공. 프론트 별도 호스팅은 SameSite=Lax 세션 쿠키가
  cross-site로 막혀 로그인 불가(onrender.com/vercel.app은 Public Suffix)라 채택하지 않음. D-010의 "같은 site" 전제를 한 origin으로 충족.
- `SpaWebConfig`: 없는 비-API 경로는 index.html(클라이언트 라우팅), `/api/**`와 확장자 있는 경로는 폴백하지 않음.
- 보안 규칙: `/api/**`는 기존대로 인증, 비-API GET/HEAD는 공개(정적 파일), 그 외 비-API 메서드는 거부.
- `GET /api/health`: 공개, 세션·DB 미사용(Render health check가 Neon을 깨우지 않도록).
- 한계: 슬립(콜드 스타트 30~60초), 세션·rate limit 메모리 → 재시작 시 초기화, 단일 인스턴스. Render 프록시 뒤 client IP 판별은 배포 후 확인 필요.

## D-041 운영 DB = PostgreSQL + Flyway (TASK-15, D-001 미결 해결)
- 운영(prod): PostgreSQL(Supabase — D-044, 또는 Neon), `spring.flyway.enabled=true`, `ddl-auto=validate`. 개발·테스트: 기존 H2 + create-drop 유지(Flyway 비활성).
- `V1__init.sql`은 Hibernate가 PostgreSQL 방언으로 생성한 DDL을 정리한 것. enum 컬럼은 CHECK 제약 유지 → enum 값 추가 시 마이그레이션 필요.
- 엔티티 변경 시 새 `V<n>__*.sql` 필수, 기존 파일 수정 금지. `PostgresMigrationTest`(Testcontainers, Docker 없으면 skip)가 실제 PostgreSQL에서 migrate + validate + 주요 쿼리(LIKE escape, CASE/SUM 집계, 기간 겹침) 검증.
- Neon은 direct connection(풀러 미사용), Hikari 최대 5.

## D-042 최초 관리자 부트스트랩 (TASK-15)
- prod는 seed 금지(D-022)이고 가입은 ADMIN 승인이 필요하므로, `BOOTSTRAP_ADMIN_USERNAME/PASSWORD`로 ADMIN이 하나도 없을 때만 1회 생성.
- 기존 계정은 승격하지 않음(경고 로그만), 가입 비밀번호 정책 위반 시 기동 실패(비밀번호는 메시지에 넣지 않음). ADMIN 생성 후에는 무시되므로 환경변수 삭제 권장.

## D-043 보안 헤더 / CSP (TASK-15, 미결 "보안 header(CSP 등)" 일부 해결)
- 모든 응답: `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`, `Referrer-Policy: same-origin` + Spring Security 기본 헤더.
- `style-src 'unsafe-inline'`은 React style 속성(일정 색상 점)과 AG Grid 테마의 동적 style 주입 때문. 스크립트는 same-origin만(인라인 스크립트 없음).

## D-044 DB 제공자 Supabase + RLS / 비밀번호 관리 (TASK-15, Human 결정: Neon 대신 Supabase)
- 접속: Supabase **Session pooler**(포트 5432, 사용자 `postgres.<프로젝트ID>`). Direct connection은 무료 플랜에서 IPv6 전용이라 Render에서 불가,
  Transaction pooler(6543)는 JDBC prepared statement와 충돌 가능. Neon은 대안으로 문서에 유지(부록 A).
- Supabase Data API(PostgREST)가 public 스키마를 공개 키(anon)로 노출하므로: 대시보드에서 Data API 비활성화 + 모든 테이블 RLS 활성화(정책 없음).
  `V2__enable_rls.sql`(앱 테이블), `afterMigrate__rls_history.sql`(Flyway 이력 테이블 — 마이그레이션 안에서 변경하면 Flyway 잠금과 교착). 앱은 소유자라 영향 없음.
  새 테이블은 같은 마이그레이션에서 RLS 필수. `PostgresMigrationTest`가 RLS 누락 테이블과 anon 접근을 검사.
- 비밀번호: Render 환경변수에만 저장(render.yaml은 `sync: false`), URL과 분리해 전달, `.env*` git 제외, 유출 의심 시 Supabase에서 재설정 → Render 값 교체.
- 후속 후보: `postgres` 대신 최소 권한 앱 전용 DB 역할.

## 미결 (TASK-01에서 결정 필요)
- rate limit 수치·잠금 정책 확정 (현재 D-020 잠정값), lockout DoS 대응
- 동시 로그인 정책, absolute session timeout
- 다중 서버 시 공유 session / rate limit 저장소 (Spring Session 등)
- 운영 Frontend/Backend Origin (SameSite 전제 확인)
- ~~DB migration 도구 및 운영 DB~~ → D-041 (Flyway + PostgreSQL)
- frontend 배포 방식과 보안 header(CSP 등) → D-040/D-043 (한 주소 배포, CSP 적용). HSTS preload·커스텀 도메인은 미결
- 게시판 확장(댓글·검색·첨부) 여부, 탈퇴/비활성 사용자의 게시글 처리 정책
- 가입 시 유출 비밀번호 검사, 봇 방지(CAPTCHA) 필요 여부
- 일정: 읽기 전용 역할, 중복 일정 차단 정책 전환 여부, 반복/알림 등 후속 확장
- 보상: 지급 완료 보상 회수, 포인트 사용·차감, 알림 여부
