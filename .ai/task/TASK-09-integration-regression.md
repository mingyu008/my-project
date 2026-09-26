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
- [ ] `http://localhost:3000` 허용
- [ ] credentials 허용
- [ ] OPTIONS 정상
- [ ] 허용되지 않은 Origin 거부

## CSRF
- [ ] token 없는 상태 변경 요청 거부
- [ ] 올바른 token 성공
- [ ] 잘못된 token 거부
- [ ] login flow
- [ ] logout flow
- [ ] authentication 이후 token lifecycle

## Login
- [ ] 정상 로그인
- [ ] 잘못된 password
- [ ] 존재하지 않는 사용자
- [ ] inactive 사용자
- [ ] rate limit
- [ ] session fixation 방어

## Session
- [ ] 로그인 후 보호 API 접근
- [ ] 새로고침 후 세션 유지
- [ ] timeout 후 401
- [ ] logout 후 401
- [ ] session ID 직접 접근 불가

## Authorization
- [ ] USER 권한
- [ ] ADMIN 권한
- [ ] 권한 부족 403

## React
- [ ] Login UI
- [ ] Auth State
- [ ] Protected Route
- [ ] 401
- [ ] 403
- [ ] 민감정보 log 없음

## AG Grid
- [ ] datasource가 Common API Client 사용
- [ ] 로그인 상태 데이터 조회
- [ ] logout 후 조회 실패
- [ ] 권한 없는 데이터 접근 실패

## Final Acceptance Criteria
- [ ] Backend tests PASS
- [ ] Frontend tests PASS
- [ ] Integration tests PASS
- [ ] CORS PASS
- [ ] CSRF PASS
- [ ] Session PASS
- [ ] Authorization PASS
- [ ] AG Grid PASS
- [ ] Gemini Security Review PASS
- [ ] ChatGPT Final Review PASS

## Commit
```bash
git add .
git commit -m "feat: implement secure session authentication"
```
