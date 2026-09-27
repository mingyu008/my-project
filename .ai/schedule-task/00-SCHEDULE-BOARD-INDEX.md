# 일정관리 게시판 개발 문서

## 1. 문서 목적
일정의 등록, 조회, 수정, 삭제, 검색 및 상태 관리를 제공하는 일정관리 게시판의 기능/화면/API/DB/개발 작업을 정의한다.

## 2. 기술 환경
- Frontend: React
- Grid: AG Grid
- Backend: Spring Boot REST API
- Frontend URL: `http://localhost:3000`
- Backend URL: `http://localhost:8080`
- API Base URL: `http://localhost:8080/api`
- Database: 관계형 DB 기준
- 인증: 기존 로그인/인증 체계 연동

## 3. 문서 구성
1. `01-REQUIREMENTS.md` - 기능 요구사항
2. `02-UI-SPEC.md` - 화면 및 UX 명세
3. `03-DATABASE.md` - DB 설계
4. `04-API-SPEC.md` - REST API 명세
5. `05-BUSINESS-RULES.md` - 업무 규칙 및 검증
6. `06-SECURITY.md` - 보안 요구사항
7. `07-TEST-PLAN.md` - 테스트 계획
8. `08-DEVELOPMENT-TASKS.md` - 개발 작업 분할
9. `09-ACCEPTANCE.md` - 완료 기준

## 4. MVP 범위
- 일정 목록 조회
- 일정 검색/필터
- 일정 등록
- 일정 상세 조회
- 일정 수정
- 일정 삭제
- 일정 상태 관리
- 우선순위 관리
- 시작/종료 일시 관리
- 담당자 관리
- 로그인 사용자 기준 권한 처리
- 서버/클라이언트 입력 검증
- 중복 일정 확인

## 5. 후속 확장 후보
- 캘린더 월/주/일 뷰
- 반복 일정
- 참석자/공유
- 알림
- 파일 첨부
- 댓글
- 일정 변경 이력
- Google/Outlook Calendar 연동
