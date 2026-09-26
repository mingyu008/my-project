# TASK-06 — Session / Authorization / AG Grid

## Owner
Claude
## Reviewer
Gemini

## 목표
로그인 상태와 권한을 Spring에서 검증하고 AG Grid가 동일한 인증 경로를 사용하도록 한다.

## Backend
Spring Security:
```text
Unauthenticated -> 401
Authenticated but forbidden -> 403
```

보호 API 예:
```text
GET /api/auth/me
GET /api/grid/data
GET /api/users
```

## React Auth State
```text
loading
authenticated
unauthenticated
```

앱 초기화에서:
```text
GET /api/auth/me
```
으로 세션을 확인한다.

React Route Guard는 UX용이며 실제 보안 경계는 Spring Security다.

## AG Grid
```text
AG Grid
  -> Grid Data Service
  -> Common API Client
  -> Spring API
```

금지:
- AG Grid에서 별도 인증 fetch
- session ID 직접 전달
- URL credential
- session ID를 Authorization header로 전달

## Session
- 로그인 후 보호 API 접근
- 새로고침 후 세션 유지
- timeout
- logout 후 session 무효
- 만료 session은 401

## Authorization
- Role/Authority 기반
- frontend UI 숨김만으로 보안 처리하지 않음
- Backend에서 최종 권한 검증

## Acceptance Criteria
- [x] `/api/auth/me`
- [x] 보호 API
- [x] 401
- [x] 403
- [x] React auth state
- [x] Protected Route
- [x] 새로고침 후 session 유지
- [x] timeout 테스트
- [x] 권한 테스트
- [x] AG Grid Common API Client
- [x] AG Grid에서 session ID 직접 접근 없음

## 구현 결과 (Claude)
### Backend
- 보호 API
  - `GET /api/auth/me` — 인증 사용자 (TASK-05에서 구현)
  - `GET /api/grid/data?startRow&endRow&sortField&sortDirection` — 인증 사용자. AG Grid infinite row model용 `{rows, lastRow}`
    - 요청당 최대 500행, 정렬 필드 whitelist(id/name/category/price/quantity), 잘못된 값은 400 `INVALID_REQUEST`
    - 데이터는 샘플 250행 (`GridDataService`) — 실제 데이터 연결 시 교체
  - `GET /api/users` — **ADMIN 전용** (`SecurityConfig` URL 규칙), `UserResponse` 목록 (passwordHash 없음)
- 401 `UNAUTHENTICATED` / 403 `FORBIDDEN` JSON
- 테스트: `AuthorizationTest`(실제 로그인 세션으로 401/403/200), `GridDataServiceTest`,
  `SessionLifecycleTest`(실제 서버 + cookie jar: 요청 간 세션 유지, 세션 만료 후 401)

### Frontend
- `AuthContext`: `loading` → `authenticated` / `unauthenticated`, 앱 시작 시 `/api/auth/me`로 세션 복원
- `ProtectedRoute`: loading 화면, 미인증 → `/login` (원래 경로 기억), role 부족 → 접근 거부 화면 (UX 전용)
- 로그인 후 원래 경로로 복귀 (`safeRedirectPath`: 앱 내부 경로만 허용, `//host` 등 차단)
- API 401 → 전역 unauthenticated → 로그인 화면
- AG Grid: `GridPage` → `gridDataService`(`createGridDatasource`) → `apiClient` → Spring
  - infinite row model, 서버 정렬, 필요한 모듈만 등록(`InfiniteRowModelModule`, `CellStyleModule`), grid 화면 lazy load
- `UsersPage`(ADMIN): 서버 403도 별도 처리
- 소스 정책 테스트에 "fetch는 `api/client.ts`에서만" 규칙 추가
- 테스트: `npm test` 62건 / backend `mvn test` 81건 통과, `tsc -b`, `vite build` 통과

### 참고
- grid chunk는 약 715kB(gzip 202kB)로 Vite 500kB 경고가 남음 (AG Grid core 자체 크기). grid 화면 진입 시에만 로드됨
