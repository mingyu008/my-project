# TASK-08 — Security Review 사전 점검 (Claude)

> **Gemini 공식 리뷰가 아닙니다.** TASK-08의 Owner는 Gemini이며, 이 문서는 구현자(Claude)가 체크리스트 기준으로
> 사전 점검하고 발견 사항을 수정한 기록입니다. PASS/FAIL 판정과 BLOCKER/HIGH 분류는 Gemini가, 최종 판단은 ChatGPT가 합니다.

## 1. 사전 점검에서 발견하여 수정한 항목

| # | 발견 내용 | 예상 등급 | 조치 | 검증 |
|---|-----------|-----------|------|------|
| F-1 | 로그인 시도 제한 없음 → password brute force / credential stuffing 가능 | HIGH 후보 | `LoginAttemptLimiter`: identifier당 5회, client(IP)당 50회 실패 / 15분 → 429 `TOO_MANY_ATTEMPTS` + `Retry-After`. 차단 시 Argon2 연산 전 거부. 존재하지 않는 identifier도 동일하게 계산(계정 존재 비노출) | `LoginAttemptLimiterTest`, `LoginRateLimitApiTest`, E2E |
| F-2 | 세션 principal이 로그인 시점 스냅샷 → INACTIVE 전환/role 회수 후에도 기존 세션이 권한 유지 (D-017) | HIGH 후보 | `SessionUserRevalidationFilter`: 인증 요청마다 DB 재확인. 삭제/INACTIVE → 세션 invalidate(401), role 변경 → 즉시 반영 | `SessionRevalidationTest` |
| F-3 | CORS가 사용하지 않는 PUT/PATCH/DELETE 허용 | LOW 후보 | 허용 method를 `GET, POST`로 축소 | `CorsTest.preflightForUnusedMethodIsRejected` |
| F-4 | 오류 응답 노출 설정이 Boot 기본값에 암묵 의존 | LOW 후보 | `server.error.include-*: never`, whitelabel off 명시 | `ErrorExposureTest`(실서버, DB 예외 메시지·stack trace 미노출) |
| F-5 | E2E에서 CORS 테스트가 CORS가 아닌 Chrome Local Network Access 때문에 통과하는 문제 발견 | 테스트 결함 | 실제 loopback 서버(3001)를 다른 origin으로 사용하도록 수정, 허용 origin에 3001을 넣는 mutation으로 테스트가 실패함을 확인 | E2E `CORS` |

## 2. 체크리스트별 근거

### CORS
| 항목 | 근거 |
|------|------|
| Origin `http://localhost:3000` | `application.yml` `app.cors.allowed-origins`, `CorsTest` |
| credentials | `SecurityConfig.corsConfigurationSource` `allowCredentials=true`, `CorsTest` |
| wildcard Origin 없음 | `CorsProperties` 기동 시 `*`·path 포함 origin 거부, `CorsPropertiesTest` |
| preflight 정상 | `CorsTest.preflightFromFrontendIsAllowedWithCredentials` |
| 불필요한 method/header 없음 | methods `GET, POST`, headers `Content-Type, X-XSRF-TOKEN` (F-3) |

### CSRF
| 항목 | 근거 |
|------|------|
| 활성화 | `HttpSessionCsrfTokenRepository`, 기본 XOR 마스킹 |
| login | token 필수, 로그인 성공 시 token 폐기·재발급 (`AuthApiTest.csrfTokenIsRotatedOnLogin`) |
| logout | token 필수, 없으면 403 & 세션 유지 (`LogoutApiTest`, E2E `CSRF`) |
| POST/PUT/PATCH/DELETE 보호 | Spring CsrfFilter 기본(GET/HEAD/OPTIONS/TRACE 외 전부) |
| React CSRF header | `client.ts` 상태 변경 요청에 `X-XSRF-TOKEN` 자동 첨부 (`client.test.ts`, E2E 요청 header 확인) |
| token lifecycle | 세션 단위, 로그인/로그아웃 시 폐기, `CSRF_INVALID` 시 재발급 1회 재시도 |

### Session
| 항목 | 근거 |
|------|------|
| HttpOnly | `SessionCookieTest`, E2E cookie 속성 확인 |
| 운영 Secure | `application-prod.yml` `__Host-SESSION` + Secure (`SessionCookieTest$Production`) |
| SameSite | Lax (D-010) |
| session fixation | `ChangeSessionIdAuthenticationStrategy` (`AuthApiTest.loginChangesSessionId`, E2E) |
| timeout | 30분(잠정), 만료 후 401 (`SessionLifecycleTest.expiredSessionGets401`) |
| logout invalidate | `LogoutApiTest`, `SessionLifecycleTest.sessionCannotBeReusedAfterLogout` |
| session ID 저장 없음 | cookie tracking only, `sourcePolicy.test.ts`, E2E(document.cookie/storage 확인) |

### Password
| 항목 | 근거 |
|------|------|
| Argon2id | `PasswordEncoderConfig` (m=19MiB, t=2, p=1), `PasswordEncoderConfigTest` |
| plaintext 없음 | `User`는 hash만 보유, seed도 인코딩 후 저장 (`SeedUsersRunnerTest`) |
| password log 없음 | `AuthServiceTest`, `AuthApiTest`, `LoginRateLimitApiTest`의 로그 캡처, 파싱 오류 로그 차단(D-011) |
| passwordHash Response 없음 | `UserResponse`/`AuthenticatedUserResponse`에 필드 없음, `@JsonIgnore`, `AuthorizationTest`, E2E |

### React
| 항목 | 근거 |
|------|------|
| Common API Client | `src/api/client.ts`, `fetch`는 이 파일에서만 (`sourcePolicy.test.ts`) |
| credentials | 모든 요청 `credentials: "include"` |
| 401/403 | 401 → 전역 unauthenticated → 로그인, 403 → 화면별 메시지 (`App.test.tsx`) |
| 민감정보 log 없음 | `console.*` 사용 금지(정적), `LoginPage.test.tsx`, E2E console 수집 |
| session ID 접근 없음 | HttpOnly, `document.cookie` 사용 금지(정적) |

### AG Grid
| 항목 | 근거 |
|------|------|
| Common API Client | `gridDataService` → `apiClient` (`gridDataService.test.ts`, `GridPage.test.tsx`) |
| 인증 우회 fetch 없음 | `sourcePolicy.test.ts` |
| URL credential 없음 | query는 startRow/endRow/sort만, E2E에서 URL `jsessionid`·Authorization header 없음 확인 |
| 권한 없는 데이터 차단 | `/api/grid/data` 인증 필수(401), 정렬 필드 whitelist, 블록 500행 제한 |

### Error Handling
| 항목 | 근거 |
|------|------|
| account enumeration 방지 | 동일 메시지·동일 401, dummy hash로 시간 균등화, INACTIVE는 password 일치 후 판정, rate limit도 존재 여부 무관 |
| stack trace 비노출 | F-4, `ErrorExposureTest` |
| DB 상세 오류 비노출 | `ErrorExposureTest`(DataIntegrityViolationException 메시지 미노출) |
| 민감정보 로그 없음 | 위 Password 항목 |

## 3. 남은 위험 / 리뷰어 판단 필요 (수정하지 않음)

| # | 내용 | 예상 등급 | 비고 |
|---|------|-----------|------|
| R-1 | identifier 기준 잠금은 제3자가 특정 계정을 15분간 잠글 수 있음 (lockout DoS) | MEDIUM 후보 | brute force 방어와의 trade-off. CAPTCHA/점진 지연 등은 TASK-01 정책 필요 |
| R-2 | rate limit·세션이 서버 메모리 → 다중 인스턴스에서 우회/유실 | MEDIUM 후보 (운영 구성 의존) | Spring Session + Redis 등 공유 저장소 필요 |
| R-3 | 동시 로그인 정책 없음 (세션 수 무제한) | LOW 후보 | TASK-01 미결 |
| R-4 | idle timeout만 있고 absolute timeout 없음 | LOW 후보 | 활동 중이면 세션이 무기한 유지 |
| R-5 | 운영 SameSite=Lax는 frontend/API가 same-site라는 전제 | 운영 구성 의존 | D-010 |
| R-6 | 요청마다 사용자 DB 조회(F-2) → 성능 비용 | 정보 | 캐시/세션 강제 만료 방식으로 대체 가능 |
| R-7 | 운영 DB/migration 미구성 (H2, `create-drop`) | 운영 전 필수 | D-001 |
| R-8 | frontend 배포용 보안 header(CSP 등) 미구성 | LOW 후보 | 배포 방식 미정 |
