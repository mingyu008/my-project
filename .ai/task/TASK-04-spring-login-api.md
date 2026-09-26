# TASK-04 — Spring Login API + CORS + CSRF

## Owner
Claude
## Reviewer
Gemini

## 환경
React `http://localhost:3000`
Spring `http://localhost:8080`

## API
### CSRF
```http
GET /api/auth/csrf
```

### Login
```http
POST /api/auth/login
Content-Type: application/json
```

```json
{
  "username": "user",
  "password": "password"
}
```

성공 시 서버 세션을 생성하고 Cookie를 전달한다. password는 응답에 포함하지 않는다.

## CORS
```text
Allowed Origin = http://localhost:3000
Allow Credentials = true
```

실제 사용하는 method/header만 허용하고 OPTIONS preflight를 정상 처리한다.

금지:
```text
Access-Control-Allow-Origin: *
```

## CSRF
- CSRF 활성화
- `/api/auth/csrf` 제공
- 상태 변경 요청 검증
- React의 CSRF header를 CORS 허용 headers에 포함
- login/logout token lifecycle 확인

예:
```text
X-XSRF-TOKEN: <token>
```

## Session Fixation
Spring Security의 session fixation protection을 사용한다.

## Cookie
검토:
- HttpOnly
- Secure
- SameSite
- Path=/
- 불필요한 Domain 지정 금지
- 가능하면 `__Host-` prefix

## Acceptance Criteria
- [ ] `/api/auth/csrf`
- [ ] `/api/auth/login`
- [ ] CORS `http://localhost:3000`
- [ ] credentials 허용
- [ ] OPTIONS preflight
- [ ] CSRF 검증
- [ ] 세션 생성
- [ ] session fixation 방어
- [ ] 인증 실패 정보 미노출
- [ ] password 로그/응답 없음
