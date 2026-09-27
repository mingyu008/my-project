# 일정관리 REST API 명세

## 1. Base URL
`http://localhost:8080/api`

## 2. 목록 조회

### GET `/schedules`

Query parameters:
- `keyword`
- `from`
- `to`
- `status`
- `priority`
- `assigneeId`
- `page`
- `size`
- `sort`

예:
`GET /api/schedules?keyword=회의&status=PLANNED&page=0&size=20`

Response:
```json
{
  "content": [
    {
      "id": 1,
      "title": "프로젝트 회의",
      "startAt": "2026-09-28T10:00:00",
      "endAt": "2026-09-28T11:00:00",
      "status": "PLANNED",
      "priority": "NORMAL",
      "assigneeId": 10,
      "location": "회의실 A"
    }
  ],
  "page": 0,
  "size": 20,
  "totalElements": 1,
  "totalPages": 1
}
```

## 3. 상세 조회

### GET `/schedules/{id}`

권한에 따라 조회 가능한 일정인지 확인한다.

## 4. 등록

### POST `/schedules`

Request:
```json
{
  "title": "프로젝트 회의",
  "description": "주간 업무 회의",
  "startAt": "2026-09-28T10:00:00",
  "endAt": "2026-09-28T11:00:00",
  "status": "PLANNED",
  "priority": "NORMAL",
  "assigneeId": 10,
  "location": "회의실 A",
  "isPublic": true,
  "color": "#3788d8"
}
```

## 5. 수정

### PUT `/schedules/{id}`

등록과 동일한 필드 구조를 사용한다.
서버에서 수정 권한을 검증한다.

## 6. 삭제

### DELETE `/schedules/{id}`

논리 삭제를 기본으로 한다.

Response:
- `204 No Content`

## 7. 중복 일정 조회

### GET `/schedules/conflicts`

Query:
- `assigneeId`
- `startAt`
- `endAt`
- `excludeId`

Response:
```json
{
  "conflict": true,
  "items": []
}
```

## 8. HTTP 상태 코드
| 코드 | 의미 |
|---|---|
| 200 | 정상 |
| 201 | 생성 성공 |
| 204 | 삭제 성공 |
| 400 | 잘못된 요청 |
| 401 | 인증 필요 |
| 403 | 권한 없음 |
| 404 | 대상 없음 |
| 409 | 충돌 |
| 500 | 서버 오류 |

## 9. 에러 형식
```json
{
  "code": "SCHEDULE_VALIDATION_ERROR",
  "message": "종료 일시는 시작 일시보다 빠를 수 없습니다.",
  "fieldErrors": [
    {
      "field": "endAt",
      "message": "올바른 종료 일시를 입력하세요."
    }
  ],
  "timestamp": "2026-09-27T18:00:00"
}
```

## 10. Spring 계층 구조
권장:
- `ScheduleController`
- `ScheduleService`
- `ScheduleRepository`
- `ScheduleEntity`
- `ScheduleRequest`
- `ScheduleResponse`
- `ScheduleMapper` 또는 변환 로직
- `ScheduleException`

Controller에서 업무 규칙을 처리하지 않는다.
