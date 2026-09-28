import type { AuthUser } from "../api/authApi";
import { hasRole } from "../auth/AuthContext";
import { isRewardManager } from "../api/rewardApi";

export interface NavItem {
  to: string;
  label: string;
}

/**
 * Main menu shared by the home page and the header. Hiding items is UX only; the server authorizes every call.
 */
export function navItems(user: AuthUser | null): NavItem[] {
  return [
    { to: "/study", label: "공부 타이머" },
    { to: "/schedule", label: "일정관리" },
    { to: "/schedule/calendar", label: "일정 달력" },
    { to: "/rewards", label: isRewardManager(user) ? "보상 관리" : "내 보상" },
    ...(isRewardManager(user) ? [{ to: "/study/review", label: "공부 기록 확인" }] : []),
    { to: "/posts", label: "게시판" },
    { to: "/grid", label: "데이터 그리드" },
    ...(hasRole(user, "ADMIN") ? [{ to: "/users", label: "사용자 관리" }] : []),
  ];
}
