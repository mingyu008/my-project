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
- [ ] `/api/auth/me`
- [ ] 보호 API
- [ ] 401
- [ ] 403
- [ ] React auth state
- [ ] Protected Route
- [ ] 새로고침 후 session 유지
- [ ] timeout 테스트
- [ ] 권한 테스트
- [ ] AG Grid Common API Client
- [ ] AG Grid에서 session ID 직접 접근 없음
