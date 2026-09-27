# TASK-13 — 일정 보상(확인자) + 일정 달력

## Owner
Claude
## Reviewer
Gemini

## 요청
Human (2026-09-27): "확인자가 일정에 대한 보상을 추가하고 관리할 수 있으며, 달력에서 확인할 수 있는 새 화면. 기획 md 작성 후 기능 추가"
- 기획: `.ai/schedule-task/10-REWARD-CALENDAR-PLAN.md`
- Human 결정: 확인자 = 새 권한 `CONFIRMER`, 보상 = 포인트 + 사유, 일정 완료 후 지급(지급 대기 → 지급 완료/취소), 달력 = 월간 + 주간

## 구현 결과 (Claude)
### Backend
| API | 설명 |
|-----|------|
| `PUT/DELETE /api/users/{id}/roles/confirmer` | ADMIN이 CONFIRMER 부여/회수 (ACTIVE만, 멱등). 기존 세션에 다음 요청부터 반영 |
| `GET /api/schedules/{id}/rewards` | 일정별 보상 `{items, canManage}`. 관리자 전체, 일반 사용자는 본인 수령분만 |
| `POST /api/schedules/{id}/rewards` | 보상 추가 (관리자, 완료된 일정, 본인 수령 불가) |
| `PUT /api/rewards/{id}` | 수정 (지급 대기만, `version` 필수) |
| `POST /api/rewards/{id}/pay`, `/cancel` | 지급 / 취소 (지급 대기만, 지급 시 일정이 여전히 완료여야 함) |
| `GET /api/rewards`, `/api/rewards/summary` | 목록(최신순, 상태·수령자 필터) / 수령자별 포인트 집계. 일반 사용자는 본인만 |
| `GET /api/schedules/calendar?from&to&status&assigneeId` | 기간(최대 62일)과 겹치는 볼 수 있는 일정, 최대 500건(`truncated`) |
- 권한 규칙은 `ScheduleAccess`로 모음 (일정/보상 공통). CONFIRMER는 모든 일정 조회 가능, 일정 수정은 불가
- `schedule_rewards` 테이블(명세 10 §5), 감사 로그 `Reward created/updated/paid/cancelled`, 거부 로그 `Reward {action} denied`
### Frontend
- `/schedule/calendar` 일정 달력: 월간(6주, 일요일 시작, 하루 3건 + "+N개 더" → 주간), 주간(시간 범위·상태 표시), 이전/오늘/다음, 상태·담당자 필터, URL에 보기·날짜·필터 저장. 라이브러리 없이 구현(`calendarUtils.ts`)
- 일정 상세 보상 영역(`RewardSection`): 관리자 추가/수정/지급/취소(확인창), 미완료 일정 안내, 일반 사용자는 본인 수령분만(없으면 숨김)
- `/rewards` 보상 관리(관리자) / 내 보상(일반): 포인트 현황 + 보상 내역(필터·페이징·지급/취소)
- 사용자 관리: 권한 한글 표시, ACTIVE 비관리자 행에 "확인자 지정/해제"
- 홈 메뉴: 일정 달력, 보상 관리(또는 내 보상). 일정 목록에 "달력 보기"
- E2E fixture 계정 `e2e-confirmer` 추가 (`application-e2e.yml`, 평범한 USER — 테스트에서 ADMIN이 UI로 권한 부여)

## 테스트
- backend `RewardApiTest`(14: 권한·완료 조건·본인 수령 금지·가시성·목록/집계·version·최종 상태·일정 재오픈/삭제 후 지급 차단·XSS 원문·CSRF), `ConfirmerRoleApiTest`(2: 부여/회수·기존 세션 반영·ADMIN만·ACTIVE만), `ScheduleApiTest` 달력 2건 추가
- frontend `calendarUtils.test.ts`(6), `calendar.test.tsx`(6), `reward.test.tsx`(9), `UsersPage.test.tsx` 확인자 지정 1건 추가
- E2E `reward-calendar.spec.ts`(2): ADMIN 확인자 지정 → 미완료 차단 → 완료 → 보상 추가·지급 → 수령자 포인트 확인 → 권한 회수 반영 / 달력 월간·"+N개 더"·주간·상세 이동

## 테스트 결과 (2026-09-27)
- backend 200 · frontend 140 통과, `tsc -b` · `vite build` 통과
- **E2E 미실행**: 실행 시점에 8080/3000 포트를 사용 중인 개발 서버가 있어 Playwright가 서버를 띄우지 못함. 서버 종료 후 `npm run e2e` 필요
