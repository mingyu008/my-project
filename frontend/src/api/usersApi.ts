import type { Role } from "./authApi";
import { apiClient } from "./client";

export interface UserSummary {
  id: number;
  loginIdentifier: string;
  status: "PENDING" | "ACTIVE" | "INACTIVE";
  roles: Role[];
  createdAt: string;
}

/**
 * ADMIN-only endpoints (the server enforces ROLE_ADMIN).
 */
export const usersApi = {
  list(signal?: AbortSignal): Promise<UserSummary[]> {
    return apiClient.get<UserSummary[]>("/api/users", signal);
  },

  approve(id: number): Promise<UserSummary> {
    return apiClient.post<UserSummary>(`/api/users/${id}/approve`);
  },

  reject(id: number): Promise<void> {
    return apiClient.post<void>(`/api/users/${id}/reject`);
  },
};
