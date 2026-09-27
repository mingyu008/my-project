# TASK-10 — 회원 가입 + 관리자 승인

## Owner
Claude
## Reviewer
Gemini

## 요청
Human: 회원 가입 화면 추가, 가입 계정은 **관리자 승인 후 활성**.

## 요구사항
- `POST /api/auth/signup` (비로그인 허용, CSRF 필수)
- 가입 계정은 `PENDING` 상태 → 로그인 불가 (로그인 실패 메시지는 기존과 동일)
- ADMIN이 사용자 관리 화면에서 승인(`ACTIVE`) 또는 거절(가입 신청 삭제)
- password 정책: 서버에서 검증 (클라이언트 검증은 UX용)
- 가입 요청 rate limit (자동 대량 가입 / Argon2 연산 남용 방지)
- password 로그/응답 금지, passwordHash 노출 금지

## Acceptance Criteria
- [x] 가입 API + 검증(아이디 형식, password 정책, 중복)
- [x] PENDING 로그인 거부
- [x] 승인/거절 API (ADMIN 전용, CSRF)
- [x] 가입 rate limit
- [x] React 가입 화면 (검증, loading, 오류, 완료 안내)
- [x] React 사용자 관리 화면 승인/거절
- [x] 민감정보 로그/응답 없음
- [x] 테스트 (backend, frontend, E2E)

## 구현 결과 (Claude)
### Backend
- `POST /api/auth/signup` `{"username","password"}` → 201 `{"loginIdentifier","status":"PENDING"}` (비로그인 허용, CSRF 필수)
  - 아이디: trim + 소문자 후 `[a-z0-9._-]{4,30}` → 위반 시 400 `INVALID_LOGIN_IDENTIFIER`
  - 비밀번호(`PasswordPolicy`): 12~128자, 한 글자 반복 금지, 아이디 포함 금지 → 400 `INVALID_PASSWORD` (메시지에 password 미포함)
  - 중복(대소문자 무시) → 409 `LOGIN_IDENTIFIER_TAKEN`
  - client당 1시간 10회(성공·실패 모두) → 429 `TOO_MANY_SIGNUPS`
- `UserStatus.PENDING` 추가. PENDING은 로그인 불가, 실패 응답은 기존과 동일 (내부 로그 reason만 `PENDING_APPROVAL`)
- ADMIN 전용: `POST /api/users/{id}/approve` (→ ACTIVE), `POST /api/users/{id}/reject` (신청 삭제, 204). PENDING이 아니면 409 `USER_NOT_PENDING`
- 감사 로그: `Signup: userId=`, `Signup approved/rejected: userId=, adminId=`
### Frontend
- `/signup` 화면(로그인 화면에서 링크): 아이디/비밀번호/비밀번호 확인, 서버 규칙과 같은 사전 검증, 오류 코드별 메시지, 완료 시 "관리자 승인 후 로그인" 안내
- 사용자 관리: 상태(승인 대기/활성/비활성), 승인 대기 수, PENDING 행에 승인/거절(거절은 확인창)
### 테스트
- backend: `PasswordPolicyTest`, `SignupApiTest`, `SignupRateLimitTest`, `UserApprovalApiTest`
- frontend: `SignupPage.test.tsx`, `UsersPage.test.tsx`
- E2E: `e2e/signup-board.spec.ts` (가입 → 로그인 거부 → ADMIN 승인 → 로그인, 거절, USER의 승인 API 403)
