# 일정 보상 관리 + 달력 화면 기획

> 작성: Claude (2026-09-27) · 요청: Human — "확인자가 일정에 대한 보상을 추가하고 관리, 달력에서 확인할 수 있는 새 화면"
> 선행: TASK-12 일정관리 게시판 (`01`~`09` 문서, DECISIONS D-029~D-034)
> 개발 작업: `.ai/task/TASK-13-reward-calendar.md`

## 1. Human 결정 사항
| 항목 | 결정 |
|---|---|
| 확인자 | 새 권한 `CONFIRMER`. ADMIN이 사용자에게 부여/회수 |
| 보상 형태 | 포인트(정수) + 사유 |
| 절차 | 일정이 **완료(COMPLETED)** 된 뒤에만 추가. 보상 상태 `지급 대기 → 지급 완료` 또는 `취소` |
| 달력 | 월간 + 주간 보기 |

## 2. 용어
- **보상 관리자**: `CONFIRMER` 또는 `ADMIN` 권한을 가진 사용자. 이하 "관리자"라고 하면 보상 관리자를 뜻함.
- **수령자**: 보상을 받는 사용자. 기본값은 일정 담당자.

## 3. 권한 모델
### 3.1 CONFIRMER 부여/회수
- ADMIN만 가능. 사용자 관리 화면(`/users`)에서 ACTIVE 사용자에게 "확인자 지정 / 해제".
- 역할 변경은 대상 사용자의 기존 세션에 다음 요청부터 반영 (기존 `SessionUserRevalidationFilter`, D-019).
- PENDING/INACTIVE 사용자에게는 부여 불가(409 `USER_NOT_ACTIVE`).

### 3.2 일정 조회 범위 변경 (D-029 보완)
- 보상 관리자(CONFIRMER)는 완료 여부를 확인해야 하므로 **모든 일정을 조회**할 수 있다.
- 일정 수정·삭제 권한은 그대로(등록자·ADMIN). CONFIRMER는 일정 자체를 바꿀 수 없다.

### 3.3 보상 권한 표
| 행위 | 보상 관리자 | 일반 사용자 |
|---|---|---|
| 일정별 보상 목록 조회 | 전체 | 본인이 수령자인 보상만 |
| 전체 보상 목록 / 포인트 집계 | 전체 사용자 | 본인 것만 |
| 보상 추가 | ○ (완료된 일정, 본인 수령 불가) | × |
| 보상 수정(포인트·사유·수령자) | ○ (지급 대기만, 본인 수령 불가) | × |
| 지급 처리 | ○ (지급 대기만, 본인 수령 불가) | × |
| 취소 | ○ (지급 대기만) | × |

- **이해충돌 방지**: 관리자는 자신이 수령자인 보상을 추가·수정·지급할 수 없다(400 `SELF_REWARD_NOT_ALLOWED`). 다른 관리자가 처리해야 한다.
- UI의 버튼 숨김은 보조 수단이며 서버가 모든 요청을 재검증한다.

## 4. 보상 업무 규칙
1. 일정이 삭제되지 않았고 상태가 `COMPLETED`일 때만 보상 추가 가능 (409 `SCHEDULE_NOT_COMPLETED`).
2. 포인트 1 ~ 100,000, 사유 1 ~ 500자(앞뒤 공백 제거), 수령자는 ACTIVE 사용자(400 `INVALID_RECIPIENT`).
3. 한 일정에 여러 보상 가능(예: 담당자 + 도움 준 사람).
4. 상태 전이
   - `PENDING`(지급 대기) → `PAID`(지급 완료): 지급 시점에도 일정이 완료 상태여야 함.
   - `PENDING` → `CANCELLED`(취소)
   - `PAID`, `CANCELLED`는 최종 상태. 수정·재처리 불가 (409 `REWARD_NOT_PENDING`).
5. 수정은 `version`으로 동시 수정 방지 (409 `REWARD_VERSION_CONFLICT`).
6. 일정이 삭제되거나 완료가 아니게 되어도 기존 보상은 이력으로 남는다. 지급 대기 보상은 지급할 수 없고 취소만 가능.
7. 등록자·수정자·지급 일시는 서버가 기록한다. 감사 로그: `Reward created/updated/paid/cancelled/denied: rewardId, scheduleId, userId`.
8. 포인트 집계: 수령자별 `지급 대기 합계`, `지급 완료 합계`, `지급 완료 건수` (취소 제외).

## 5. 데이터
### `schedule_rewards`
| 컬럼 | 타입 | NULL | 설명 |
|---|---|:-:|---|
| id | BIGINT | N | PK |
| schedule_id | BIGINT | N | FK schedules |
| recipient_id | BIGINT | N | FK users, 수령자 |
| points | INT | N | 1 ~ 100,000 |
| reason | VARCHAR(500) | N | 사유 (plain text) |
| status | VARCHAR(20) | N | PENDING / PAID / CANCELLED |
| created_by / created_at | BIGINT / TIMESTAMP | N | 등록 |
| updated_by / updated_at | BIGINT / TIMESTAMP | N | 최종 처리 |
| paid_at | TIMESTAMP | Y | 지급 일시 |
| version | BIGINT | N | optimistic lock |

인덱스: `(schedule_id)`, `(recipient_id, status)`, `(status)`
### `user_roles`
- 기존 테이블에 `CONFIRMER` 값 추가 (문자열 저장이라 스키마 변경 없음).

## 6. API
### 6.1 확인자 권한 (ADMIN, `/api/users/**`)
| Method | Path | 설명 |
|---|---|---|
| PUT | `/api/users/{id}/roles/confirmer` | CONFIRMER 부여 → 200 `UserResponse` |
| DELETE | `/api/users/{id}/roles/confirmer` | CONFIRMER 회수 → 200 `UserResponse` |

### 6.2 보상
| Method | Path | 설명 |
|---|---|---|
| GET | `/api/schedules/{id}/rewards` | 일정별 보상 `{items, canManage}` (일정이 안 보이면 404) |
| POST | `/api/schedules/{id}/rewards` | 추가 `{recipientId, points, reason}` → 201 |
| PUT | `/api/rewards/{rewardId}` | 수정 `{recipientId, points, reason, version}` |
| POST | `/api/rewards/{rewardId}/pay` | 지급 처리 |
| POST | `/api/rewards/{rewardId}/cancel` | 취소 |
| GET | `/api/rewards?status=&recipientId=&page=&size=` | 보상 목록 (최신순, size ≤ 100). 일반 사용자는 본인 것만 |
| GET | `/api/rewards/summary` | 수령자별 포인트 집계. 일반 사용자는 본인만 |

보상 응답:
```json
{
  "id": 3, "scheduleId": 7, "scheduleTitle": "주간 회의",
  "recipient": {"id": 2, "loginIdentifier": "bob"},
  "points": 100, "reason": "기한 내 완료", "status": "PENDING",
  "createdBy": {...}, "createdAt": "...", "updatedBy": {...}, "updatedAt": "...", "paidAt": null,
  "version": 0, "manageable": true
}
```
`manageable`: 현재 사용자가 이 보상을 수정·지급할 수 있는지(UX 힌트).

### 6.3 달력
| Method | Path | 설명 |
|---|---|---|
| GET | `/api/schedules/calendar?from=yyyy-MM-dd&to=yyyy-MM-dd&status=&assigneeId=` | 기간과 겹치는, 볼 수 있는 일정. 기간 최대 62일, 최대 500건(`truncated`) |

응답: `{ "items": [ScheduleSummary...], "truncated": false }` (시작 일시 오름차순)

## 7. 화면
### 7.1 달력 `/schedule/calendar` (신규)
```
┌ 일정 달력 ─────────────────────────── [목록 보기] [새 일정] ┐
│ [<] [오늘] [>]   2026년 9월        (월간|주간)  상태[전체▾] 담당자[전체▾] │
├──일──┬──월──┬──화──┬──수──┬──목──┬──금──┬──토──┤
│ 30   │ 31   │  1   │  2   │  3   │  4   │  5   │  ← 다른 달은 흐리게
│      │      │●10:00 주간회의│      │      │      │  ← 색상 점 + 시간 + 제목
│      │      │+2개 더│      │      │      │      │  ← 누르면 그 주의 주간 보기
│ ...  6주 고정                                     │
└───────────────────────────────────────────────┘
```
- **월간**: 6주 × 7일 고정, 일요일 시작, 오늘 강조. 하루 최대 3건 + "+N개 더"(→ 해당 주 주간 보기).
- **주간**: 7개 열, 그 날의 일정 전부를 시간순으로 "10:00–11:00 제목"으로 표시. 여러 날 일정은 이어지는 날에 "(계속)" 표시.
- 상태는 텍스트 라벨/툴팁 병기, 취소된 일정은 취소선. 일정 클릭 → 상세.
- 이전/다음/오늘 이동, 월간·주간 전환, 상태·담당자 필터.
- 현재 보기와 날짜는 URL(`?view=week&date=2026-09-28`)에 저장 → 새로고침·뒤로가기 유지.
- 달력 라이브러리 없이 구현(번들 크기, CSP 미결 D-미결). 날짜 계산은 `yyyy-MM-dd` 문자열 기준으로 시간대 변환 없음.
- 태블릿 폭에서는 월간 셀에 제목만(시간 생략) 표시.

### 7.2 일정 상세 — 보상 영역 (확장)
```
보상                                             [보상 추가] (관리자, 완료된 일정)
┌ 수령자 ┬ 포인트 ┬ 사유       ┬ 상태     ┬ 처리                 ┐
│ bob    │ 100   │ 기한 내 완료 │ 지급 대기 │ [수정] [지급] [취소] │
│ carol  │  30   │ 자료 지원   │ 지급 완료 │ 2026-09-28 지급       │
└────────┴───────┴────────────┴──────────┴──────────────────────┘
```
- 추가/수정 폼(인라인): 수령자(기본 담당자), 포인트, 사유. 필드별 오류.
- 일정이 완료가 아니면 관리자에게 "완료된 일정에만 보상을 추가할 수 있습니다." 안내.
- 일반 사용자에게는 본인이 받은 보상만 보이고, 없으면 영역을 숨긴다.
- 지급·취소는 확인창 후 처리.

### 7.3 보상 관리 `/rewards` (신규)
- 상단: 포인트 집계 표(수령자, 지급 대기, 지급 완료, 건수). 일반 사용자는 "내 포인트" 한 줄.
- 하단: 보상 목록 표(일정 링크, 수령자, 포인트, 사유, 상태, 등록자, 처리일) + 상태 필터(+관리자는 수령자 필터) + 페이징.
- 관리자: 지급 대기 행에 [지급] [취소].

### 7.4 사용자 관리 `/users` (확장)
- 권한 열에 "확인자" 표시, ACTIVE 사용자 행에 [확인자 지정] / [확인자 해제].

### 7.5 메뉴
- 홈: 일정관리, **일정 달력**, **보상**, 게시판, 데이터 그리드, (ADMIN) 사용자 관리
- 일정 목록 상단: [달력 보기]

## 8. 보안
- 모든 보상 API 로그인 필요, 권한은 `RewardService`에서 검증(IDOR: 안 보이는 일정 404, 권한 없는 보상 조작 403).
- 클라이언트가 보낸 등록자·상태·지급 일시는 무시(요청 DTO에 없음).
- 사유는 plain text, 화면은 text로만 렌더링(정적 검사 유지).
- 포인트 집계는 일반 사용자에게 타인 정보를 노출하지 않음.

## 9. 테스트 계획
- Backend: 권한 부여/회수(ADMIN만, ACTIVE만, 세션 반영), 보상 CRUD·상태 전이·완료 조건·본인 수령 금지·version·가시성(수령자 본인만)·집계, 달력 기간/필터/최대 기간/가시성.
- Frontend: 달력 월간/주간 렌더링·이동·URL 상태·"+N개 더"·필터, 상세 보상 영역(관리자/일반), 보상 관리 화면, 사용자 관리 확인자 지정.
- E2E: ADMIN이 확인자 지정 → 일정 완료 → 확인자 보상 추가·지급 → 수령자 포인트 확인, 미완료 일정 차단, 달력에서 일정 확인.

## 10. 개발 순서
1. Role `CONFIRMER` + 부여/회수 API + 일정 조회 범위 확장
2. 보상 도메인/API + 테스트
3. 달력 API + 테스트
4. 프론트: 역할·사용자 관리 → 상세 보상 영역 → 보상 관리 화면 → 달력 화면
5. E2E, 문서(TASK-13, DECISIONS) 정리

## 11. 범위 제외 (후속 후보)
- 포인트 사용/차감, 등급·랭킹, 보상 알림, 일괄 지급, 지급 완료 보상의 회수(현재는 최종 상태)
- 일간 보기, 드래그로 일정 이동, 공휴일 표시
