import type { AuthUser } from "./authApi";
import { apiClient } from "./client";
import type { UserRef } from "./scheduleApi";

// Mirrors server limits (ScheduleReward.MIN_POINTS/MAX_POINTS/REASON_MAX_LENGTH, RewardService.MAX_PAGE_SIZE).
export const REWARD_MIN_POINTS = 1;
export const REWARD_MAX_POINTS = 100_000;
export const REWARD_REASON_MAX_LENGTH = 500;
export const REWARD_PAGE_SIZE = 20;

export const REWARD_STATUSES = ["PENDING", "PAID", "CANCELLED"] as const;
export type RewardStatus = (typeof REWARD_STATUSES)[number];

/** {@code reason} is plain text: render it as text only. */
export interface Reward {
  id: number;
  scheduleId: number;
  scheduleTitle: string;
  recipient: UserRef;
  points: number;
  reason: string;
  status: RewardStatus;
  createdBy: UserRef;
  createdAt: string;
  updatedBy: UserRef;
  updatedAt: string;
  paidAt: string | null;
  version: number;
  /** UX hint only; the server re-checks every change. */
  manageable: boolean;
}

export interface ScheduleRewards {
  items: Reward[];
  /** The user may add rewards to this schedule. */
  canManage: boolean;
}

export interface RewardPage {
  content: Reward[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface RewardSummary {
  recipient: UserRef;
  pendingPoints: number;
  paidPoints: number;
  paidCount: number;
}

export interface RewardInput {
  recipientId: number;
  points: number;
  reason: string;
  /** Required for update. */
  version?: number;
}

/** CONFIRMER or ADMIN (UX only; the server decides). */
export function isRewardManager(user: AuthUser | null): boolean {
  return Boolean(user && (user.roles.includes("CONFIRMER") || user.roles.includes("ADMIN")));
}

export const rewardApi = {
  forSchedule(scheduleId: number, signal?: AbortSignal): Promise<ScheduleRewards> {
    return apiClient.get<ScheduleRewards>(`/api/schedules/${scheduleId}/rewards`, signal);
  },

  create(scheduleId: number, input: RewardInput): Promise<Reward> {
    return apiClient.post<Reward>(`/api/schedules/${scheduleId}/rewards`, input);
  },

  update(rewardId: number, input: RewardInput): Promise<Reward> {
    return apiClient.put<Reward>(`/api/rewards/${rewardId}`, input);
  },

  pay(rewardId: number): Promise<Reward> {
    return apiClient.post<Reward>(`/api/rewards/${rewardId}/pay`);
  },

  cancel(rewardId: number): Promise<Reward> {
    return apiClient.post<Reward>(`/api/rewards/${rewardId}/cancel`);
  },

  list(request: { status?: RewardStatus; recipientId?: number; page: number }, signal?: AbortSignal): Promise<RewardPage> {
    const params = new URLSearchParams();
    if (request.status) params.set("status", request.status);
    if (request.recipientId !== undefined) params.set("recipientId", String(request.recipientId));
    params.set("page", String(request.page));
    params.set("size", String(REWARD_PAGE_SIZE));
    return apiClient.get<RewardPage>(`/api/rewards?${params.toString()}`, signal);
  },

  summary(signal?: AbortSignal): Promise<RewardSummary[]> {
    return apiClient.get<RewardSummary[]>("/api/rewards/summary", signal);
  },
};
