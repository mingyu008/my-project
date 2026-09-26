# TASK-05 — React Auth Client + Login UI

## Owner
Claude
## Reviewer
Gemini

## 환경
React `http://localhost:3000`
Spring `http://localhost:8080`

## 목표
React에서 Spring Session 인증을 안전하게 사용한다.

## Common API Client
권장:
```text
src/api/
  client.*
  authApi.*
```

책임:
- Backend base URL
- credentials 포함
- CSRF token 처리
- 공통 error handling
- 401/403 처리

Fetch 예:
```javascript
fetch(url, { credentials: "include" })
```

## 인증 세션 저장 금지
금지:
- localStorage
- sessionStorage
- URL parameter
- session ID를 Authorization header에 삽입
- session ID를 JS에 별도 저장

## Login Flow
```text
GET /api/auth/csrf
 -> CSRF token 확보
 -> POST /api/auth/login
 -> 성공
 -> 필요 시 CSRF token 재확보
 -> GET /api/auth/me
```

## Login UI
- login identifier
- password
- loading
- validation
- authentication failure
- network error
- successful navigation

금지:
```javascript
console.log(password)
console.log(sessionId)
console.log(csrfToken)
```

## Acceptance Criteria
- [x] Common API Client
- [x] credentials 포함
- [x] CSRF 처리
- [x] Login UI
- [x] loading
- [x] error handling
- [x] `/api/auth/me` 연동
- [x] localStorage/sessionStorage 인증정보 없음
- [x] 민감정보 console log 없음

## 구현 결과 (Claude)
- 위치: `frontend/` (Vite + React 19 + TypeScript, react-router, Vitest + Testing Library)
- dev server: `http://localhost:3000` (`strictPort`), API: `VITE_API_BASE_URL` (기본 `http://localhost:8080`)
- Common API Client: `src/api/client.ts`
  - 모든 요청 `credentials: "include"`, `cache: "no-store"`
  - 상태 변경 요청(POST/PUT/PATCH/DELETE)에 CSRF header 자동 첨부, token은 모듈 메모리에만 보관, 동시 요청 시 발급 1회
  - `CSRF_INVALID`(403) → token 재발급 후 1회 재시도
  - 에러는 `ApiError(status, code, message)`로 통일, fetch 실패 → `NETWORK_ERROR`
  - 401 `UNAUTHENTICATED` → `onUnauthorized` 구독자에게 통지 (로그인 실패 401은 제외)
- `src/api/authApi.ts`: `login()` 성공 시 CSRF token 폐기(서버 rotation 반영), `me()`
- `src/auth/AuthContext.tsx`: 메모리 auth state, `login()` = csrf → login → me
- `src/pages/LoginPage.tsx`: 입력 검증(필수, 100/128자), loading/중복 제출 방지, 인증 실패·네트워크·기타 오류 메시지, 실패 시 password 초기화, 성공 시 `/` 이동
- Backend: `GET /api/auth/me` 추가 (TASK-06 범위를 앞당김 — AC의 `/api/auth/me` 연동에 필요)
- 테스트: `npm test` 30건, `tsc -b`, `vite build` 통과 / backend `mvn test` 69건 통과
  - `src/test/sourcePolicy.test.ts`: 소스에 localStorage/sessionStorage/document.cookie/console.*/Authorization header/jsessionid 사용이 없는지 정적 검사

## TASK-06으로 넘긴 항목
- 앱 시작 시 `/api/auth/me`로 세션 확인 (`loading` 상태), Protected Route, 401 시 로그인 화면 이동
