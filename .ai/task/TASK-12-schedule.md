# TASK-12 — 일정관리 게시판

## Owner
Claude
## Reviewer
Gemini

## 요청
Human (2026-09-27): `.ai/schedule-task/` 명세(01~09)의 작업을 현재 프로젝트에 추가해서 진행.
명세 내부의 TASK-01~06(DB/Entity → API → 목록 → 등록/수정 → 통합 테스트 → 정리)을 이 TASK 하나로 수행.

## 구현 결과 (Claude)
### Backend (`com.myproject.schedule`)
| API | 설명 |
|-----|------|
| `GET /api/schedules` | 검색 `keyword`(제목 부분일치, 대소문자 무시), `from`/`to`(yyyy-MM-dd, 기간 겹침), `status`, `priority`, `assigneeId`, `createdById` + `page`, `size`(1~100), `sort=field,asc\|desc`. 기본 시작 일시 내림차순. 응답 `{content, page, size, totalElements, totalPages}` (목록에는 설명 없음) |
| `GET /api/schedules/{id}` | 상세 + `editable`(등록자 또는 ADMIN, UX 힌트) + `version` |
| `POST /api/schedules` | 201 + Location. 등록자·수정자·일시는 서버 세션에서 기록 |
| `PUT /api/schedules/{id}` | 등록자·ADMIN만(403). `version` 필수, 불일치 409 `SCHEDULE_VERSION_CONFLICT` |
| `DELETE /api/schedules/{id}` | 등록자·ADMIN만, 논리 삭제(`deleted=true`), 204 |
| `GET /api/schedules/conflicts` | `assigneeId`, `startAt`, `endAt`, `excludeId` → `{conflict, items, hiddenCount}` |
| `GET /api/schedules/assignees` | 담당자 선택용 ACTIVE 사용자 `{id, loginIdentifier}` |
- 테이블 `schedules`: 명세 03 컬럼 + `version`(optimistic lock), 명세 권장 인덱스
- 검증: 제목 1~200자, 설명 ≤5,000, 장소 ≤300, 색상 `#RRGGBB`, 종료 < 시작 400 `INVALID_SCHEDULE_PERIOD`, 담당자는 ACTIVE 사용자만(400 `INVALID_ASSIGNEE`)
- 상태 전이: PLANNED→IN_PROGRESS/CANCELLED, IN_PROGRESS→COMPLETED/CANCELLED. 위반 400 `INVALID_STATUS_TRANSITION`, ADMIN은 강제 변경 가능
- 조회 범위/404 정책, 중복 판정은 DECISIONS D-029 ~ D-033
- 검색은 Criteria API(Specification)만 사용, LIKE 와일드카드(`%`, `_`) escape
- 감사 로그 `Schedule created/updated/deleted/denied: scheduleId, userId`
### Frontend
- `/schedule`(목록), `/schedule/new`, `/schedule/:id`, `/schedule/:id/edit` — 모두 로그인 필요, 홈 메뉴에 "일정관리"
- 목록: 검색 영역(검색어·기간·상태·우선순위·담당자·등록자, 검색/초기화) + AG Grid(infinite row model + pagination, 서버 정렬, 20건/페이지). 상태·우선순위는 텍스트 라벨 + 색. 폭 1000px 미만에서 장소·등록자·등록일·수정일 컬럼 숨김
- 폼: 필드별 오류, 종료<시작 즉시 표시, 저장 중 비활성화, 담당자 지정 시 저장 전 중복 확인 → 경고 후 "그래도 저장", 수정 화면에 삭제 버튼, 일반 사용자는 허용된 상태만 선택 가능
- 상세: 전체 필드, 설명/장소는 text로만 렌더링, 수정·삭제는 `editable`일 때만, 삭제 확인창
- AG Grid 번들은 `/schedule` 진입 시에만 lazy load

## 명세와 다른 점
- 에러 형식: 명세 04의 `fieldErrors`/`timestamp` 대신 기존 공통 `{code, message}` 유지 (D-034)
- "읽기 사용자" 역할: 기존 Role(USER/ADMIN)에 없어 미구현 (D-029)
- 목록 체크박스 컬럼: 일괄 작업이 없어 생략

## 완료 기준 (09-ACCEPTANCE)
- 기능: 목록, 제목·기간·상태·우선순위·담당자 검색, 등록, 상세, 수정, 삭제, 중복 확인 — 완료
- 권한: 로그인 필요, 본인 일정 수정/삭제, ADMIN 전체 관리, 타 사용자 일정 ID 직접 접근 차단(404/403), UI·서버 권한 일치 — 완료
- 데이터: 시작/종료 검증, 논리 삭제, 등록자/수정자, createdAt/updatedAt — 완료
- UI: AG Grid 목록, 검색 영역, 등록/수정 폼, 삭제 확인, 로딩 상태, API 오류 메시지, validation 메시지 — 완료
- 품질: backend/frontend/권한/E2E 테스트 통과, 빌드 성공 — 완료
- 배포 전 확인(운영 DB migration, CORS 운영 설정 등): 기존 미결 항목과 동일 — **미완**

## 테스트
- backend `ScheduleApiTest`(23: 권한·IDOR·검증·검색·기간·정렬/페이징·optimistic lock·상태 전이·논리 삭제·중복·XSS 원문 보존·CSRF), `ScheduleRulesTest`(12)
- frontend `schedule.test.tsx`(19: 목록/검색/정렬/오류, 상세 XSS·권한·삭제, 폼 검증·등록·중복 경고·수정 version·상태 옵션·409)
- E2E `schedule.spec.ts`(3): 등록 → 중복 경고 → 검색 → 담당자 읽기 전용(UI·API 403) → 작성자 삭제, 비공개 일정 타 사용자 404 / ADMIN 조회, 비로그인 차단

## 테스트 결과 (2026-09-27)
backend 182 · frontend 118 · E2E 20 모두 통과, `tsc -b` · `vite build` 통과
