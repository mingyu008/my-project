import { ApiError } from "../../api/client";

export const STUDY_MESSAGES = {
  loading: "공부 기록을 불러오는 중...",
  loadFailed: "공부 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
  selectSubject: "과목을 먼저 선택해 주세요.",
  activeExists: "이미 진행 중인 공부가 있어요. 이어서 하거나 종료해 주세요.",
  recoveryTitle: "이전에 진행 중인 공부가 있습니다.",
  stopConfirm: "공부를 끝낼까요?",
  discardConfirm: "이번 공부 시간을 저장하지 않고 버릴까요?",
  savedOffline: "네트워크 오류로 아직 저장하지 못했어요. 연결되면 자동으로 저장할게요.",
  pendingSaves: (n: number) => `저장 대기 중인 기록 ${n}개 · 연결되면 자동으로 저장돼요`,
  flushed: "대기 중이던 공부 기록을 저장했어요.",
  wakeLockUnsupported:
    "화면 자동 꺼짐 방지를 지원하지 않는 브라우저입니다. 기기 설정에서 화면 자동 꺼짐 시간을 길게 설정해주세요.",
  subjectTaken: "이미 있는 과목이에요.",
  subjectInvalid: "과목 이름은 1~20자로 입력해 주세요.",
  tooManySubjects: "과목은 20개까지 만들 수 있어요.",
  durationInvalid: "공부시간은 1분 ~ 24시간으로 입력해 주세요.",
  periodInvalid: "종료 시각이 시작 시각보다 늦어야 해요. (자정을 넘기면 나눠서 입력해 주세요)",
  periodFuture: "아직 지나지 않은 시간은 기록할 수 없어요.",
  dailyLimit: "하루 공부시간은 24시간을 넘을 수 없어요.",
  goalPrompt: "하루 목표 공부시간(시간)을 입력해 주세요. 예: 8 또는 5.5",
  goalInvalid: "목표는 10분 ~ 24시간으로 입력해 주세요.",
  focusDone: "집중 시간 끝! 잠깐 쉬어요 ☕",
  breakDone: "휴식 끝! 다음 집중을 시작해요 💪",
  networkError: "서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.",
  generic: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
} as const;

/**
 * Maps API errors to a user message. Returns null for 401 (the app redirects to login globally).
 */
export function studyErrorMessage(error: unknown): string | null {
  if (error instanceof ApiError) {
    if (error.status === 401) return null;
    switch (error.code) {
      case "ACTIVE_SESSION_EXISTS":
        return STUDY_MESSAGES.activeExists;
      case "SUBJECT_NAME_TAKEN":
        return STUDY_MESSAGES.subjectTaken;
      case "INVALID_SUBJECT_NAME":
        return STUDY_MESSAGES.subjectInvalid;
      case "TOO_MANY_SUBJECTS":
        return STUDY_MESSAGES.tooManySubjects;
      case "INVALID_DURATION":
        return STUDY_MESSAGES.durationInvalid;
      case "INVALID_PERIOD":
        return STUDY_MESSAGES.periodInvalid;
      case "DAILY_LIMIT_EXCEEDED":
        return STUDY_MESSAGES.dailyLimit;
      case "INVALID_GOAL":
        return STUDY_MESSAGES.goalInvalid;
      case "NETWORK_ERROR":
        return STUDY_MESSAGES.networkError;
    }
  }
  return STUDY_MESSAGES.generic;
}

export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.code === "NETWORK_ERROR";
}
