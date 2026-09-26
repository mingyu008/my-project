# TASK-05 — React Auth Client + Login UI 리뷰

## 검토 결과: 통과 (Approved)

React 프론트엔드에서 Spring Session 인증을 안전하게 사용하기 위한 요구사항을 충족함. 인증 정보가 메모리상에서만 관리되며 로컬 스토리지 등에 저장되지 않도록 강제하는 정책이 정적 테스트로 확보됨.

### 1. 보안 핵심 구현
- **인증 정보 저장**: 인증 상태(`AuthState`)가 오직 React 메모리 상태(`useState`)로만 관리됨. 세션 ID는 브라우저 관리의 HttpOnly 쿠키로만 전달(`credentials: "include"`)되며, JS에서 접근 불가.
- **CSRF 방어**: CSRF 토큰을 메모리상(`client.ts` 모듈 변수)에만 보관하고, 상태 변경 요청 시에만 헤더에 자동 첨부. 실패 시 자동 재발급 로직이 견고함.
- **안티-패턴 방어**: `sourcePolicy.test.ts`를 통해 `localStorage`, `sessionStorage`, `console.*`, `Authorization` 헤더 사용을 코드 수준에서 원천 금지함.

### 2. 상세 검토 의견
- **`client.ts`**: API 클라이언트 수준에서 모든 요청에 `credentials: "include"`와 `cache: "no-store"`를 강제하여 브라우저의 쿠키 자동 전송을 활용하고 캐시를 방지함.
- **`AuthContext.tsx`**: React Context를 활용한 상태 관리가 적절하며, `onUnauthorized` 콜백을 통해 세션 만료 처리가 구조화됨.
- **`LoginPage.tsx`**: 로그인 실패 시 민감 정보(`password`)를 즉시 초기화하여 보안 사고를 예방함.

### 3. 종합 의견
요구사항을 완벽히 이행했으며, 보안 정책을 자동화된 테스트로 강제하는 접근 방식이 매우 인상적임. 다음 태스크 진행 가능.
