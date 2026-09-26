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
- [ ] POST logout
- [ ] CSRF
- [ ] session invalidate
- [ ] cookie 정리
- [ ] React auth state 정리
- [ ] logout 후 protected API 401
- [ ] 이전 session 재사용 불가
