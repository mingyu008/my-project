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
- [x] `/api/auth/csrf`
- [x] `/api/auth/login`
- [x] CORS `http://localhost:3000`
- [x] credentials 허용
- [x] OPTIONS preflight
- [x] CSRF 검증
- [x] 세션 생성
- [x] session fixation 방어
- [x] 인증 실패 정보 미노출
- [x] password 로그/응답 없음

## 구현 결과 (Claude)
- `SecurityConfig` (`com.myproject.security`)
  - CORS: `/api/**`, origin은 `app.cors.allowed-origins`(기본 `http://localhost:3000`), credentials 허용, methods GET/POST/PUT/PATCH/DELETE/OPTIONS, headers `Content-Type`, `X-XSRF-TOKEN`, preflight 캐시 1h. `*`·path 포함 origin은 기동 시 거부(`CorsProperties`)
  - CSRF: `HttpSessionCsrfTokenRepository`, header `X-XSRF-TOKEN`, 기본 XOR 마스킹(BREACH 대응)
  - formLogin/httpBasic/기본 logout/requestCache 비활성화, 401·403은 JSON
- API (`AuthController`)
  - `GET /api/auth/csrf` → `{"headerName":"X-XSRF-TOKEN","token":"..."}` (필요 시 세션 생성, `Cache-Control: no-store`)
  - `POST /api/auth/login` `{"username","password"}` → 200 `{"id","loginIdentifier","roles"}`
    - 실패는 모두 401 `{"code":"AUTHENTICATION_FAILED","message":"Invalid login identifier or password"}`
    - 성공 시 session ID 변경(session fixation 방어) + CSRF token 폐기 → **로그인 후 `/api/auth/csrf` 재호출 필요**
- 에러 코드: `UNAUTHENTICATED`(401), `FORBIDDEN`(403), `CSRF_INVALID`(403), `AUTHENTICATION_FAILED`(401), `MALFORMED_REQUEST`(400)
- Cookie
  - dev: `JSESSIONID`, HttpOnly, SameSite=Lax, Path=/, Domain 없음, URL tracking 비활성화
  - prod(`application-prod.yml`): `__Host-SESSION`, Secure 추가, `APP_CORS_ALLOWED_ORIGINS` 환경변수 필수
- 테스트: `AuthApiTest`, `CorsTest`, `CorsPropertiesTest`, `SessionCookieTest` — 전체 `mvn test` 67건 통과
- 결정 사항은 `.ai/DECISIONS.md`의 D-008 ~ D-011 참고
