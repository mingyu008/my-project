import { Link } from "react-router-dom";

export const FORBIDDEN_MESSAGE = "이 화면에 접근할 권한이 없습니다.";

export function ForbiddenPage() {
  return (
    <main>
      <h1>접근 거부</h1>
      <p>{FORBIDDEN_MESSAGE}</p>
      <Link to="/">홈으로</Link>
    </main>
  );
}
