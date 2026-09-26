# React + Spring API 인증 기능 AI 협업 작업서

## 프로젝트 환경
- React: `http://localhost:3000`
- Spring API: `http://localhost:8080`
- AG Grid 사용
- React와 Spring은 개발 환경에서 서로 다른 Origin

## 인증 아키텍처
```text
React :3000
  -> Common API Client
  -> credentials: include + CSRF Header
  -> Spring API :8080
  -> Spring Security / CORS / CSRF / HttpSession
  -> Protected REST API
```

### 기본 보안 정책
- Spring Security
- 서버 세션(HttpSession) 기반 인증
- 인증 세션은 HttpOnly Cookie
- 운영 HTTPS에서는 Secure 적용
- SameSite 정책 명시
- 가능하면 `__Host-` Cookie prefix 검토
- 비밀번호는 Argon2id 계열 PasswordEncoder
- CSRF 보호 활성화
- CORS는 `http://localhost:3000`만 명시적으로 허용
- credentialed CORS 사용
- `Access-Control-Allow-Origin: *` 사용 금지
- React의 API 호출은 Common API Client 사용
- AG Grid datasource도 Common API Client 사용
- session ID를 localStorage/sessionStorage/URL/Authorization header에 저장하지 않음

## 주요 API
```text
GET  /api/auth/csrf
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
GET/POST/PUT/PATCH/DELETE /api/...
```

## React 요청
Fetch 예:
```javascript
fetch("http://localhost:8080/api/auth/me", {
  credentials: "include"
});
```

## CSRF 흐름
```text
GET /api/auth/csrf
 -> token 확보
 -> POST /api/auth/login
 -> 인증 성공
 -> 필요 시 CSRF token 재확보
 -> GET /api/auth/me
```

상태 변경 요청에는 Spring 설정과 동일한 CSRF header를 사용한다.

## AI 역할
### ChatGPT
PM / Architect / Acceptance Criteria / 최종 통합 검토

### Claude
Developer / 코드 구현 / 테스트 / 수정 / Git commit

### Gemini
Security Reviewer / QA / CORS·CSRF·Session·React·AG Grid 검토

## 작업 순서
1. TASK-01 요구사항/보안 기준
2. TASK-02 User Domain
3. TASK-03 Password/Auth Service
4. TASK-04 Spring Login API + CORS/CSRF
5. TASK-05 React Auth Client + Login UI
6. TASK-06 Session/Authorization + AG Grid
7. TASK-07 Logout
8. TASK-08 Gemini Security Review
9. TASK-09 Integration/Regression

`BLOCKER` 또는 `HIGH` 발견 시 다음 단계로 진행하지 않는다.

## Git
각 단계 완료 후:
```bash
git status
git diff
git add .
git commit -m "feat: complete TASK-xx"
```

운영에서는 localhost 대신 실제 HTTPS Origin으로 변경하고 CORS, Cookie, SameSite, Secure 정책을 재검토한다.
