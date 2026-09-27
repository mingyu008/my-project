# 일정관리 개발 작업 분할

## TASK-01: Backend DB/Entity
담당: Backend

작업:
- schedule 테이블 생성
- Entity 생성
- Enum 생성
- Repository 생성
- 논리 삭제 처리
- Audit 필드 처리

완료:
- 애플리케이션 기동 성공
- CRUD Repository 테스트 완료

## TASK-02: Backend API
담당: Backend

작업:
- DTO
- Controller
- Service
- 목록 검색
- 상세
- 등록
- 수정
- 삭제
- 중복 일정 API
- Validation
- Exception 처리

완료:
- API 명세와 실제 응답 일치
- 권한 검증 완료

## TASK-03: Frontend 목록
담당: Frontend

작업:
- `/schedule`
- 검색 영역
- AG Grid
- 서버 페이징
- 정렬
- 상태/우선순위 표시
- 상세 이동

완료:
- 목록/검색/페이징 정상 동작

## TASK-04: Frontend 등록/수정
담당: Frontend

작업:
- 등록 폼
- 수정 폼
- validation
- API 연동
- 중복 일정 경고
- 삭제

완료:
- CRUD 전체 동작

## TASK-05: 통합 테스트
담당: QA 또는 개발자

작업:
- API 테스트
- 권한 테스트
- UI 테스트
- 오류 케이스
- 브라우저 테스트

## TASK-06: 코드 리뷰 및 정리
- 중복 코드 제거
- API/DTO 명명 통일
- 로그 점검
- 보안 설정 점검
- README 업데이트

## 작업 순서
`TASK-01 → TASK-02 → TASK-03 → TASK-04 → TASK-05 → TASK-06`

## AI 개발 시 원칙
각 TASK는 독립된 작업 단위로 수행한다.
작업 시작 전에 관련 MD를 읽고 기존 코드를 먼저 분석한다.
기존 인증/공통 컴포넌트/DB 규칙을 임의로 변경하지 않는다.
변경 후 테스트 결과와 변경 파일 목록을 보고한다.
