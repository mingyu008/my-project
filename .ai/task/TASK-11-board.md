# TASK-11 — 게시판 (글 CRUD + 페이징)

## Owner
Claude
## Reviewer
Gemini

## 요청
Human: 로그인 후 사용하는 게시판. 범위는 글 CRUD + 페이징 (댓글/검색 제외).

## 요구사항
- 로그인 사용자만 조회/작성
- 수정/삭제는 작성자 본인 또는 ADMIN — **서버에서 검증**
- 목록 페이징 (page size 상한)
- 입력 검증 (제목/본문 길이)
- XSS: 본문은 text로만 렌더링 (HTML 해석 금지)
- 모든 호출은 Common API Client (CSRF, credentials)

## Acceptance Criteria
- [x] 목록/상세/작성/수정/삭제 API
- [x] 작성자·ADMIN 외 수정/삭제 403
- [x] 404 / 400 처리
- [x] 페이징
- [x] React 목록/상세/작성/수정 화면, 권한 없는 버튼 숨김(UX)
- [x] XSS 방지 (정적 검사 포함)
- [x] 테스트 (backend, frontend, E2E)

## 구현 결과 (Claude)
### Backend (`com.myproject.board`)
| API | 설명 |
|-----|------|
| `GET /api/posts?page=0&size=20` | 최신순, size 1~50, `{items, page, size, totalElements, totalPages}` (목록에는 본문 없음) |
| `GET /api/posts/{id}` | 상세 + `editable`(작성자 또는 ADMIN, UX 힌트) |
| `POST /api/posts` | 201 + Location |
| `PUT /api/posts/{id}` | 작성자·ADMIN만, 그 외 403 `FORBIDDEN` |
| `DELETE /api/posts/{id}` | 작성자·ADMIN만, 204 |
- 검증: 제목 1~200자(앞뒤 공백 제거), 본문 1~10,000자 → 400 `INVALID_REQUEST` ("Invalid field: ..." — 값은 응답에 포함 안 함)
- 없는 글 404 `NOT_FOUND`, 잘못된 id 400
- 본문은 plain text로 저장·반환 (HTML 처리 없음), 감사 로그 `Post created/updated/deleted/denied: postId, userId`
- CORS 허용 method에 PUT, DELETE 추가 (D-027)
### Frontend
- `/posts`(목록, `?page=N` 1-based), `/posts/new`, `/posts/:id`, `/posts/:id/edit` — 모두 로그인 필요
- 본문은 React text 렌더링 + `white-space: pre-wrap`. 소스 정책 테스트에 `dangerouslySetInnerHTML`/`innerHTML`/`eval` 금지 추가
- 수정/삭제 버튼은 `editable`일 때만 표시, 서버 403도 화면에서 처리, 삭제는 확인창
### 테스트
- backend `PostApiTest` (권한, 검증, 페이징, XSS 문자열 원문 보존, CSRF)
- frontend `board.test.tsx` (목록/페이징, XSS 텍스트 렌더링, 수정/삭제, 403/404)
- E2E: 작성 → 본문 텍스트 표시(스크립트 미실행) → 수정 → 다른 사용자 UI·API 차단 → 작성자 삭제, ADMIN 삭제, 21건 페이징, 비로그인 차단

## 테스트 결과 (2026-09-26)
backend 147 · frontend 99 · E2E 17 (auth 11 + signup/board 6) 모두 통과, `tsc -b` · `vite build` 통과
