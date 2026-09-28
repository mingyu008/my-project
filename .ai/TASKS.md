# Tasks

| Task | 제목 | Owner | 상태 |
|------|------|-------|------|
| TASK-01 | 요구사항 및 보안 아키텍처 확정 | ChatGPT | TODO |
| TASK-02 | User Domain 및 Repository | Claude | DONE (Gemini Approved) |
| TASK-03 | Password/Auth Service | Claude | DONE (Gemini Approved) |
| TASK-04 | Spring Login API + CORS/CSRF | Claude | DONE (Gemini Approved) |
| TASK-05 | React Auth Client + Login UI | Claude | DONE (Gemini Approved) |
| TASK-06 | Session/Authorization + AG Grid | Claude | DONE (Gemini 리뷰 대기) |
| TASK-07 | Logout | Claude | DONE (Gemini 리뷰 대기) |
| TASK-08 | Gemini Security Review | Gemini | Claude 사전 점검 완료, **Gemini 리뷰 대기** |
| TASK-09 | Integration/Regression | Claude | 테스트 완료 (E2E 11 · BE 105 · FE 67), **최종 리뷰 대기** |

## 리뷰 현황
- Gemini 리뷰 완료: TASK-02 ~ TASK-05 (Approved)
- Gemini 리뷰 대기: TASK-06, TASK-07, TASK-08(공식), TASK-09
- 커밋: `init push` 이후 TASK-04 ~ 09 변경분 미커밋

## 추가 요청 (Human, 2026-09-26)
| Task | 제목 | Owner | 상태 |
|------|------|-------|------|
| TASK-10 | 회원 가입 + 관리자 승인 | Claude | DONE (Gemini 리뷰 대기) |
| TASK-11 | 게시판 (글 CRUD + 페이징) | Claude | DONE (Gemini 리뷰 대기) |

## 추가 요청 (Human, 2026-09-27)
| Task | 제목 | Owner | 상태 |
|------|------|-------|------|
| TASK-12 | 일정관리 게시판 (`.ai/schedule-task/` 명세) | Claude | DONE (Gemini 리뷰 대기) |
| TASK-13 | 일정 보상(확인자) + 일정 달력 (`schedule-task/10-REWARD-CALENDAR-PLAN.md`) | Claude | DONE (E2E 미실행, Gemini 리뷰 대기) |
| TASK-14 | 모바일/웹 반응형 (공통 헤더 메뉴, 휴대폰 카드·달력 레이아웃) | Claude | DONE (FE 148, 390px/1280px 스크린샷 확인, E2E 미실행) |
| TASK-15 | 무료 배포: Supabase PostgreSQL + Render 한 주소 (Flyway, RLS, Docker, 최초 관리자, CSP) | Claude | 코드·로컬 검증 완료, **Supabase/Render 설정·push 대기** |
| TASK-16 | 일정 등록·수정 Slack 알림 (확인자 공용 채널, 커밋 후 비동기) | Claude | DONE (BE 216), **Slack Webhook 발급·Render 설정 대기** |

## 추가 요청 (Human, 2026-09-28)
| Task | 제목 | Owner | 상태 |
|------|------|-------|------|
| TASK-17 | 중고등학생 디자인 + 로그인 테스트 모드(닉네임 로그인, D-046) + 모바일 dev 접속(`npm run dev:mobile`) | Claude | DONE (BE·FE 테스트 통과), **Render 운영 테스트 모드 동작 확인 대기** |
| TASK-TIMER-01 | 학생 공부시간 Timer (`.ai/timer-task/`, D-047) | Claude | DONE (BE 243 · FE 177, 로컬 API 확인), **실기기 모바일 Chrome/Safari·E2E 미실행** |
| TASK-TIMER-02 | 확인자 공부 기록 확인 + 하루 단위 공부 보상 (D-048) | Claude | DONE (BE 248 · FE 183, 로컬 API 확인), **V3~V5 실제 PostgreSQL 미검증(Docker 없음)** |
