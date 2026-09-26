# TASK-01 — 요구사항 및 보안 아키텍처 확정

## Owner
ChatGPT
## Reviewer
Gemini

## 환경
- React: `http://localhost:3000`
- Spring API: `http://localhost:8080`
- AG Grid

## 목표
인증, 세션, CORS, CSRF, React API Client의 계약을 확정한다.

## 기본 설계
- Spring Security
- HttpSession 기반 인증
- HttpOnly Session Cookie
- 운영 HTTPS에서 Secure
- SameSite 명시
- Argon2id 계열 PasswordEncoder
- CSRF 활성화
- CORS Allowed Origin = `http://localhost:3000`
- Allow Credentials = true
- wildcard Origin 금지
- React Common API Client
- AG Grid도 Common API Client 사용
- session ID를 localStorage/sessionStorage에 저장하지 않음

## 확정 항목
- [ ] login identifier
- [ ] User 상태
- [ ] Role/Authority
- [ ] Session timeout
- [ ] CSRF endpoint
- [ ] CSRF header
- [ ] 401 응답
- [ ] 403 응답
- [ ] Login rate limit
- [ ] 동시 로그인 정책
- [ ] 운영 Frontend Origin
- [ ] 운영 Backend Origin
- [ ] 단일/다중 서버 및 공유 세션 저장소

## Acceptance Criteria
- [ ] React/Spring URL 확정
- [ ] 인증 방식 확정
- [ ] Password 정책 확정
- [ ] Cookie 정책 확정
- [ ] CORS 정책 확정
- [ ] CSRF 정책 확정
- [ ] Session timeout 확정
- [ ] Authorization 정책 확정
- [ ] React API Client 정책 확정
- [ ] AG Grid API 정책 확정
- [ ] 401/403 정책 확정
