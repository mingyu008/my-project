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
- [ ] Common API Client
- [ ] credentials 포함
- [ ] CSRF 처리
- [ ] Login UI
- [ ] loading
- [ ] error handling
- [ ] `/api/auth/me` 연동
- [ ] localStorage/sessionStorage 인증정보 없음
- [ ] 민감정보 console log 없음
