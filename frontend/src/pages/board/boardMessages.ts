import { ApiError } from "../../api/client";

export const BOARD_MESSAGES = {
  loading: "불러오는 중...",
  empty: "게시글이 없습니다.",
  notFound: "게시글을 찾을 수 없습니다.",
  forbidden: "이 게시글을 수정하거나 삭제할 권한이 없습니다.",
  invalid: "입력값을 확인해 주세요.",
  networkError: "서버에 연결할 수 없습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
  generic: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  titleRequired: "제목을 입력해 주세요.",
  contentRequired: "내용을 입력해 주세요.",
} as const;

/**
 * Maps API errors to a user message. Returns null for 401 (the app redirects to login globally).
 */
export function boardErrorMessage(error: unknown): string | null {
  if (error instanceof ApiError) {
    if (error.status === 401) return null;
    if (error.status === 403) return BOARD_MESSAGES.forbidden;
    if (error.status === 404) return BOARD_MESSAGES.notFound;
    if (error.status === 400) return BOARD_MESSAGES.invalid;
    if (error.code === "NETWORK_ERROR") return BOARD_MESSAGES.networkError;
  }
  return BOARD_MESSAGES.generic;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR");
}
