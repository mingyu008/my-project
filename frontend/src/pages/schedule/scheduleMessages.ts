import { ApiError } from "../../api/client";
import { SCHEDULE_COLOR_PATTERN, type SchedulePriority, type ScheduleStatus } from "../../api/scheduleApi";

export const SCHEDULE_MESSAGES = {
  loading: "불러오는 중...",
  notFound: "일정을 찾을 수 없습니다.",
  forbidden: "이 일정을 수정하거나 삭제할 권한이 없습니다.",
  invalid: "입력값을 확인해 주세요.",
  versionConflict: "다른 사용자가 먼저 이 일정을 수정했습니다. 새로고침한 뒤 다시 시도해 주세요.",
  networkError: "서버에 연결할 수 없습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
  generic: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  listError: "일정 목록을 불러오지 못했습니다.",
  titleRequired: "제목을 입력해 주세요.",
  startRequired: "시작 일시를 입력해 주세요.",
  endRequired: "종료 일시를 입력해 주세요.",
  endBeforeStart: "종료 일시는 시작 일시보다 빠를 수 없습니다.",
  periodInvalid: "검색 종료일은 시작일보다 빠를 수 없습니다.",
  assigneeInvalid: "선택한 담당자를 지정할 수 없습니다.",
  statusTransition: "현재 상태에서 선택한 상태로 변경할 수 없습니다.",
  deleteConfirm: "이 일정을 삭제할까요?",
} as const;

export const STATUS_LABELS: Record<ScheduleStatus, string> = {
  PLANNED: "예정",
  IN_PROGRESS: "진행중",
  COMPLETED: "완료",
  CANCELLED: "취소",
};

export const PRIORITY_LABELS: Record<SchedulePriority, string> = {
  LOW: "낮음",
  NORMAL: "보통",
  HIGH: "높음",
  URGENT: "긴급",
};

/** Mirrors ScheduleStatus.canChangeTo on the server (ADMIN may bypass). */
const NEXT_STATUSES: Record<ScheduleStatus, ScheduleStatus[]> = {
  PLANNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function allowedStatuses(current: ScheduleStatus): ScheduleStatus[] {
  return [current, ...NEXT_STATUSES[current]];
}

export const COLOR_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "#3788d8", label: "파랑" },
  { value: "#2f9e44", label: "초록" },
  { value: "#f08c00", label: "주황" },
  { value: "#e03131", label: "빨강" },
  { value: "#7048e8", label: "보라" },
];

/**
 * Maps API errors to a user message. Returns null for 401 (the app redirects to login globally).
 */
export function scheduleErrorMessage(error: unknown): string | null {
  if (error instanceof ApiError) {
    if (error.status === 401) return null;
    if (error.status === 403) return SCHEDULE_MESSAGES.forbidden;
    if (error.status === 404) return SCHEDULE_MESSAGES.notFound;
    if (error.code === "SCHEDULE_VERSION_CONFLICT") return SCHEDULE_MESSAGES.versionConflict;
    if (error.code === "INVALID_SCHEDULE_PERIOD") return SCHEDULE_MESSAGES.endBeforeStart;
    if (error.status === 400) return SCHEDULE_MESSAGES.invalid;
    if (error.code === "NETWORK_ERROR") return SCHEDULE_MESSAGES.networkError;
  }
  return SCHEDULE_MESSAGES.generic;
}

/** "2026-09-28T10:00:00" -> "2026-09-28 10:00" (wall-clock time; no time zone conversion). */
export function formatLocalDateTime(value: string): string {
  return value.slice(0, 16).replace("T", " ");
}

/** datetime-local input value ("2026-09-28T10:00") <-> API value ("2026-09-28T10:00:00"). */
export function toInputDateTime(value: string): string {
  return value.slice(0, 16);
}

export function toApiDateTime(value: string): string {
  return value.length === 16 ? `${value}:00` : value;
}

export function safeColor(color: string | null): string | null {
  return color && SCHEDULE_COLOR_PATTERN.test(color) ? color : null;
}
