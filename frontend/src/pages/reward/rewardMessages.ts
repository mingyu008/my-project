import { ApiError } from "../../api/client";
import type { RewardStatus } from "../../api/rewardApi";

export const REWARD_MESSAGES = {
  loading: "보상을 불러오는 중...",
  empty: "보상 내역이 없습니다.",
  notCompleted: "완료된 일정에만 보상을 추가할 수 있습니다.",
  selfReward: "본인이 받는 보상은 다른 확인자가 처리해야 합니다.",
  invalidRecipient: "선택한 수령자에게 보상을 줄 수 없습니다.",
  notPending: "이미 처리된 보상입니다. 새로고침해 주세요.",
  versionConflict: "다른 사용자가 먼저 이 보상을 수정했습니다. 새로고침한 뒤 다시 시도해 주세요.",
  forbidden: "보상을 관리할 권한이 없습니다.",
  notFound: "보상을 찾을 수 없습니다.",
  invalid: "입력값을 확인해 주세요.",
  networkError: "서버에 연결할 수 없습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
  generic: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  recipientRequired: "수령자를 선택해 주세요.",
  pointsInvalid: "포인트는 1 ~ 100,000 사이의 정수로 입력해 주세요.",
  reasonRequired: "사유를 입력해 주세요.",
  payConfirm: "이 보상을 지급 완료로 처리할까요? 지급 후에는 변경할 수 없습니다.",
  cancelConfirm: "이 보상을 취소할까요? 취소 후에는 변경할 수 없습니다.",
} as const;

export const REWARD_STATUS_LABELS: Record<RewardStatus, string> = {
  PENDING: "지급 대기",
  PAID: "지급 완료",
  CANCELLED: "취소",
};

/**
 * Maps API errors to a user message. Returns null for 401 (the app redirects to login globally).
 */
export function rewardErrorMessage(error: unknown): string | null {
  if (error instanceof ApiError) {
    if (error.status === 401) return null;
    switch (error.code) {
      case "SCHEDULE_NOT_COMPLETED":
        return REWARD_MESSAGES.notCompleted;
      case "SELF_REWARD_NOT_ALLOWED":
        return REWARD_MESSAGES.selfReward;
      case "INVALID_RECIPIENT":
        return REWARD_MESSAGES.invalidRecipient;
      case "REWARD_NOT_PENDING":
        return REWARD_MESSAGES.notPending;
      case "REWARD_VERSION_CONFLICT":
        return REWARD_MESSAGES.versionConflict;
      case "NETWORK_ERROR":
        return REWARD_MESSAGES.networkError;
    }
    if (error.status === 403) return REWARD_MESSAGES.forbidden;
    if (error.status === 404) return REWARD_MESSAGES.notFound;
    if (error.status === 400) return REWARD_MESSAGES.invalid;
  }
  return REWARD_MESSAGES.generic;
}

export function formatPoints(points: number): string {
  return `${points.toLocaleString("ko-KR")}P`;
}
