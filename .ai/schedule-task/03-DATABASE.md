# 일정관리 게시판 DB 설계

## 1. 테이블
테이블명 예시: `schedule`

## 2. 컬럼

| 컬럼 | 타입 예시 | NULL | 설명 |
|---|---|---:|---|
| id | BIGINT | N | PK |
| title | VARCHAR(200) | N | 일정 제목 |
| description | TEXT | Y | 설명 |
| start_at | TIMESTAMP | N | 시작 일시 |
| end_at | TIMESTAMP | N | 종료 일시 |
| status | VARCHAR(30) | N | 상태 |
| priority | VARCHAR(30) | N | 우선순위 |
| assignee_id | BIGINT | Y | 담당자 ID |
| location | VARCHAR(300) | Y | 장소 |
| is_public | BOOLEAN | N | 공개 여부 |
| color | VARCHAR(20) | Y | 표시 색상 |
| created_by | BIGINT | N | 등록자 |
| created_at | TIMESTAMP | N | 등록일 |
| updated_by | BIGINT | N | 수정자 |
| updated_at | TIMESTAMP | N | 수정일 |
| deleted | BOOLEAN | N | 삭제 여부 |

## 3. 인덱스
권장:
- `(start_at)`
- `(end_at)`
- `(status)`
- `(assignee_id)`
- `(created_by)`
- `(deleted, start_at)`

검색 패턴에 따라 복합 인덱스를 추가한다.

## 4. 논리 삭제
삭제 시:
`deleted = true`

기본 조회:
`deleted = false`

## 5. FK
기존 사용자 테이블이 있다면:
- `assignee_id -> user.id`
- `created_by -> user.id`
- `updated_by -> user.id`

실제 사용자 테이블명은 기존 프로젝트 스키마를 따른다.

## 6. Enum 저장
DB에는 문자열 코드로 저장한다.
예:
`PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`

장점:
- 코드 가독성
- API와 DB 값 일관성
- 순서 변경에 안전

## 7. 동시성
수정 충돌 방지가 필요하면 `version` 컬럼을 추가하고 Optimistic Lock을 적용한다.

권장 추가 컬럼:
`version BIGINT NOT NULL DEFAULT 0`
