# TASK-09 — Integration / Regression Test

## Owner
Claude
## Reviewer
Gemini + ChatGPT

## 목표
React `3000`에서 Spring `8080`까지 전체 인증 흐름을 실제 Browser Origin 기준으로 검증한다.

## End-to-End
```text
React :3000
 -> GET /api/auth/csrf
 -> POST /api/auth/login
 -> Spring Security
 -> HttpSession
 -> Session Cookie
 -> GET /api/auth/me
 -> Protected API
 -> AG Grid API
 -> POST /api/auth/logout
 -> Session invalidated
```

## CORS
- [x] `http://localhost:3000` 허용
- [x] credentials 허용
- [x] OPTIONS 정상
- [x] 허용되지 않은 Origin 거부

## CSRF
- [x] token 없는 상태 변경 요청 거부
- [x] 올바른 token 성공
- [x] 잘못된 token 거부
- [x] login flow
- [x] logout flow
- [x] authentication 이후 token lifecycle

## Login
- [x] 정상 로그인
- [x] 잘못된 password
- [x] 존재하지 않는 사용자
- [x] inactive 사용자
- [x] rate limit
- [x] session fixation 방어

## Session
- [x] 로그인 후 보호 API 접근
- [x] 새로고침 후 세션 유지
- [x] timeout 후 401
- [x] logout 후 401
- [x] session ID 직접 접근 불가

## Authorization
- [x] USER 권한
- [x] ADMIN 권한
- [x] 권한 부족 403

## React
- [x] Login UI
- [x] Auth State
- [x] Protected Route
- [x] 401
- [x] 403
- [x] 민감정보 log 없음

## AG Grid
- [x] datasource가 Common API Client 사용
- [x] 로그인 상태 데이터 조회
- [x] logout 후 조회 실패
- [x] 권한 없는 데이터 접근 실패

## Final Acceptance Criteria
- [x] Backend tests PASS
- [x] Frontend tests PASS
- [x] Integration tests PASS
- [x] CORS PASS
- [x] CSRF PASS
- [x] Session PASS
- [x] Authorization PASS
- [x] AG Grid PASS
- [ ] Gemini Security Review PASS
- [ ] ChatGPT Final Review PASS

## Commit
```bash
git add .
git commit -m "feat: implement secure session authentication"
```

## 실행 결과 (Claude, 2026-09-26)

| 구분 | 명령 | 결과 |
|------|------|------|
| Backend | `cd backend; mvn test` | 105 passed |
| Frontend unit | `cd frontend; npm test` | 67 passed |
| Frontend type/build | `npx tsc -b`, `npm run build` | 통과 (grid chunk 500kB 경고만) |
| **Browser E2E** | `cd frontend; npm run e2e` | **11 passed** (실제 Chrome, `:3000` → `:8080`) |

E2E(`frontend/e2e/auth.spec.ts`)는 Playwright가 Spring(`e2e` profile, fixture 사용자 seed)과 Vite를 직접 띄워 실행한다.
포트 8080/3000/3001이 비어 있어야 한다.

### 항목별 검증 위치
| 항목 | E2E (실제 브라우저) | Backend/Unit |
|------|---------------------|--------------|
| CORS 허용/credentials/preflight | 전체 흐름(cross-origin fetch + JSON POST preflight) | `CorsTest` |
| 허용되지 않은 Origin 거부 | `CORS` — 실제 loopback 서버(3001)에서 cookie 포함 요청 차단. 3001을 허용하면 실패함을 mutation으로 확인 | `CorsTest` |
| CSRF 없음/잘못됨 거부, 정상 성공 | `CSRF`, 전체 흐름 | `AuthApiTest`, `LogoutApiTest` |
| login/logout token lifecycle | 전체 흐름, `session end` | `AuthApiTest.csrfTokenIsRotatedOnLogin`, `LogoutApiTest.csrfTokenOfLoggedOutSessionCannotBeReused` |
| 정상/잘못된 password/없는 사용자/inactive | `login flow` (동일 메시지) | `AuthServiceTest`, `AuthApiTest` |
| rate limit | `repeated failures are rate limited` | `LoginRateLimitApiTest`, `LoginAttemptLimiterTest` |
| session fixation | `session ID changes on login` | `AuthApiTest.loginChangesSessionId` |
| 보호 API / 새로고침 유지 | 전체 흐름, `session survives a page refresh` | `SessionLifecycleTest` |
| timeout 후 401 | (30분 대기 불가) | `SessionLifecycleTest.expiredSessionGets401` — 실서버·실 cookie, 세션 만료 1초로 단축 |
| logout 후 401, 이전 세션 재사용 불가 | `session end` (이전 cookie 재주입 → 401) | `SessionLifecycleTest.sessionCannotBeReusedAfterLogout` |
| session ID 직접 접근 불가 | HttpOnly 확인, `document.cookie`/storage 비어있음 | `sourcePolicy.test.ts` |
| USER/ADMIN/403 | `authorization` | `AuthorizationTest`, `SessionRevalidationTest` |
| React UI/Auth State/Protected Route/401/403 | 전 시나리오 | `App.test.tsx`, `LoginPage.test.tsx` |
| 민감정보 log 없음 | console 수집(password·session ID 미포함) | backend 로그 캡처 테스트들, `LoginPage.test.tsx` |
| AG Grid: Common API Client / 로그인 상태 조회 / logout 후 실패 / 권한 | 전체 흐름(`Item 001` 표시), `session end` | `gridDataService.test.ts`, `GridPage.test.tsx`, `AuthorizationTest` |

### 남은 항목
- [ ] Gemini Security Review PASS — TASK-08 공식 리뷰 대기 (사전 점검: `.ai/reports/claude/TASK-08-PRE-REVIEW.md`)
- [ ] ChatGPT Final Review PASS
- Commit: 최종 리뷰 통과 후 Human 승인 하에 진행 (아직 커밋하지 않음)

### CI
- `.github/workflows/ci.yml`: backend `mvn test`, frontend `npm test` + build, E2E(`npm run e2e`)를 push/PR마다 실행
