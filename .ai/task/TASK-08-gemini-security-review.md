# TASK-08 — Gemini Security Review

## Owner
Gemini
## Final Reviewer
ChatGPT

Gemini는 코드를 직접 수정하지 않고 문제의 위치, 위험, 재현, 수정 방향을 보고한다.

## CORS
- [ ] Origin `http://localhost:3000`
- [ ] credentials
- [ ] wildcard Origin 없음
- [ ] preflight 정상
- [ ] 불필요한 method/header 없음

## CSRF
- [ ] 활성화
- [ ] login 검토
- [ ] logout 검토
- [ ] POST/PUT/PATCH/DELETE 보호
- [ ] React CSRF header 확인
- [ ] token lifecycle 확인

## Session
- [ ] HttpOnly
- [ ] 운영 Secure
- [ ] SameSite
- [ ] session fixation protection
- [ ] timeout
- [ ] logout invalidate
- [ ] session ID 저장 없음

## Password
- [ ] Argon2id 계열
- [ ] plaintext password 없음
- [ ] password log 없음
- [ ] passwordHash Response 없음

## React
- [ ] Common API Client
- [ ] credentials
- [ ] 401/403
- [ ] 민감정보 log 없음
- [ ] session ID 접근 없음

## AG Grid
- [ ] Common API Client
- [ ] 인증 우회 fetch 없음
- [ ] URL credential 없음
- [ ] 권한 없는 데이터 접근 차단

## Error Handling
- [ ] account enumeration 방지
- [ ] stack trace 외부 노출 없음
- [ ] DB 상세 오류 외부 노출 없음
- [ ] 민감정보 로그 없음

## 결과
```text
REVIEW RESULT

BLOCKER:
- 없음

HIGH:
- 없음

MEDIUM:
- 없음

LOW:
- 없음

CORS:
PASS / FAIL

CSRF:
PASS / FAIL

SESSION:
PASS / FAIL

PASSWORD:
PASS / FAIL

REACT:
PASS / FAIL

AG GRID:
PASS / FAIL

TEST:
PASS / FAIL

FINAL:
PASS / CHANGES_REQUIRED
```

BLOCKER/HIGH가 있으면 TASK-09로 진행하지 않는다.
