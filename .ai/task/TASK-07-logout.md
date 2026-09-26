# TASK-07 — Logout

## Owner
Claude
## Reviewer
Gemini

## API
```http
POST /api/auth/logout
```

## 요구사항
- CSRF 보호
- 서버 session invalidate
- session cookie 정리
- React auth state 초기화

## React Flow
```text
Logout
 -> POST /api/auth/logout
 -> Server Session invalidate
 -> auth state = unauthenticated
 -> Login/Public route
```

logout 후:
```text
GET /api/auth/me -> 401
```

## 금지
- GET logout만으로 상태 변경
- localStorage 삭제만으로 로그아웃 완료 처리
- session invalidate 생략
- session ID 직접 조작

## Acceptance Criteria
- [x] POST logout
- [x] CSRF
- [x] session invalidate
- [x] cookie 정리
- [x] React auth state 정리
- [x] logout 후 protected API 401
- [x] 이전 session 재사용 불가

## 구현 결과 (Claude)
### Backend (`SecurityConfig` logout 설정)
- `POST /api/auth/logout` → 204 No Content
  - CSRF 필수 (없거나 틀리면 403 `CSRF_INVALID`, 세션 유지)
  - `HttpSession` invalidate + SecurityContext 제거 + CSRF token 폐기
  - session cookie 삭제 (`Set-Cookie: JSESSIONID=; Max-Age=0`, prod는 `__Host-SESSION`)
  - 세션이 없어도 204 (idempotent), `GET /api/auth/logout`은 아무 변화 없음
  - 감사 로그: `Logout: userId=...`
### Frontend
- `authApi.logout()`: POST + CSRF, 성공/실패와 무관하게 메모리 CSRF token 폐기
- `AuthContext.logout()`: 서버가 204(또는 401=이미 세션 없음)를 준 경우에만 `unauthenticated`로 전환.
  네트워크 오류 시 세션이 살아있을 수 있으므로 상태 유지 + 오류 표시 (`LogoutButton`)
- 로그아웃 후 `ProtectedRoute`가 `/login`으로 이동
### 테스트
- backend `LogoutApiTest`(6), `SessionLifecycleTest.sessionCannotBeReusedAfterLogout`(실서버, 이전 cookie 재전송 → 401)
- frontend `App.test.tsx`(로그아웃 흐름, 네트워크 실패), `authApi.test.ts`(token 폐기)
- E2E `session end` 시나리오 (실제 Chrome)
